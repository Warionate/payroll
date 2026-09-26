import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticateToken } from './auth.js';
import db from '../db.js';
import cache from '../utils/cache.js';
import { normalizeOriginalName } from '../utils/normalizeOriginalName.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadsPath = path.join(__dirname, '..', '..', 'uploads');

export interface FileMetadata {
  originalName?: string;
  mimetype?: string;
  uploadedBy?: number;
  missing?: boolean;
}

const metaPathFor = (filename: string): string =>
  path.join(uploadsPath, '.meta', `${filename}.json`);

/**
 * Build Content-Disposition header with RFC5987 filename* and ASCII fallback.
 */
export const buildContentDisposition = (
  type: 'inline' | 'attachment',
  filename: string,
): string => {
  const safeName = path.basename(String(filename || '')).replace(/[\r\n]/g, '');
  const fallback = safeName.replace(/[^\x20-\x7E]/g, '_') || 'download';
  const encoded = encodeURIComponent(safeName);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

/**
 * Check if a user was explicitly granted access to a file via the file_access
 * table. The chat-membership JOIN and encrypted-message scan fallback were
 * removed with the chat feature (G章); only the file_access fast path remains.
 */
export const canAccessUpload = (userId: number, filename: string): boolean => {
  try {
    const accessCacheKey = `uploads:access:${userId}:${filename}`;
    const cachedAccess = cache.get(accessCacheKey);
    if (typeof cachedAccess === 'boolean') {
      return cachedAccess;
    }

    const fileAccessRow = db
      .prepare(`SELECT 1 FROM file_access WHERE filename = ? AND user_id = ?`)
      .get(filename, userId);

    const allowed = Boolean(fileAccessRow);
    cache.set(accessCacheKey, allowed, allowed ? 60 : 30);
    return allowed;
  } catch (_e) {
    // Ignore errors and deny by default
  }
  cache.set(`uploads:access:${userId}:${filename}`, false, 30);
  return false;
};

export type UploadAccessDecision =
  { allowed: true; metadata: FileMetadata | null } | { allowed: false; status: 403 | 404 };

/**
 * Single source of truth for upload access (A-2). Used by both the static
 * `/uploads` middleware and the `/api/uploads/download/:filename` route so the
 * owner check can never be bypassed by a one-sided edit.
 *
 * Deny by default: only an admin viewing a file whose metadata is merely missing
 * (ENOENT) may proceed. Any other failure — a corrupted/unreadable .meta JSON
 * (SyntaxError, EACCES, ...) — returns 404 so the uploadedBy owner check is never
 * skipped.
 */
export async function resolveUploadAccess(
  user: { id: number; role: string },
  filename: string,
): Promise<UploadAccessDecision> {
  const cacheKey = `uploads:meta:${filename}`;
  try {
    const cachedMeta = cache.get(cacheKey) as FileMetadata | undefined;
    if (cachedMeta && cachedMeta.missing) {
      // Metadata known-missing: admins may still access the raw file.
      return user.role === 'admin'
        ? { allowed: true, metadata: null }
        : { allowed: false, status: 404 };
    }

    const metadata: FileMetadata = cachedMeta
      ? cachedMeta
      : JSON.parse(await fs.promises.readFile(metaPathFor(filename), 'utf8'));

    if (!cachedMeta) {
      cache.set(cacheKey, metadata, 60);
    }

    if (metadata.uploadedBy && metadata.uploadedBy !== user.id && user.role !== 'admin') {
      if (!canAccessUpload(user.id, filename)) {
        return { allowed: false, status: 403 };
      }
    }
    return { allowed: true, metadata };
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      cache.set(cacheKey, { missing: true }, 30);
    }
    return error.code === 'ENOENT' && user.role === 'admin'
      ? { allowed: true, metadata: null }
      : { allowed: false, status: 404 };
  }
}

/**
 * Upload access control middleware for Express (static `/uploads` serving).
 * Authenticates the user, resolves access via resolveUploadAccess, and sets an
 * inline Content-Disposition from the stored original filename.
 */
export const uploadAccessMiddleware = [
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Prevent access to .meta folder
    if (req.path.startsWith('/.meta')) {
      res.status(404).json({ error: 'ファイルが見つかりません' });
      return;
    }

    const rawFilename = req.path.slice(1); // Remove leading /
    const filename = path.basename(rawFilename);
    if (filename !== rawFilename || filename === '' || filename.startsWith('.')) {
      res.status(404).json({ error: 'ファイルが見つかりません' });
      return;
    }

    const decision = await resolveUploadAccess(req.user!, filename);
    if (!decision.allowed) {
      res.status(decision.status).json({
        error: decision.status === 403 ? 'アクセス権限がありません' : 'ファイルが見つかりません',
      });
      return;
    }

    if (decision.metadata?.originalName) {
      res.setHeader(
        'Content-Disposition',
        buildContentDisposition('inline', normalizeOriginalName(decision.metadata.originalName)),
      );
    }
    next();
  },
  express.static(uploadsPath),
];
