import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';
import { decrypt } from './crypto.js';
import type Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

/**
 * Extract upload file paths from markdown/text content
 */
export function extractUploadPaths(content: string): string[] {
  if (!content) return [];

  const filenames = new Set<string>();

  // Pattern 1: Markdown images/links ![alt](/uploads/filename) or [text](/uploads/filename)
  const markdownRegex = /\]\(\/uploads\/([^)]+)\)/g;
  let match;
  while ((match = markdownRegex.exec(content)) !== null) {
    filenames.add(match[1]);
  }

  // Pattern 2: Direct URLs /uploads/filename (not in markdown)
  const directRegex = /(?:^|\s|:)(\/uploads\/([^\s<>"']+))/g;
  while ((match = directRegex.exec(content)) !== null) {
    filenames.add(match[2]);
  }

  return Array.from(filenames);
}

/**
 * Delete uploaded files referenced in a message
 */
export async function deleteUploadedFilesFromMessage(message: string): Promise<void> {
  const filenames = extractUploadPaths(message);
  const metaDir = path.join(UPLOADS_DIR, '.meta');

  await Promise.all(
    filenames.map(async (filename) => {
      // Path traversal prevention
      const safeName = path.basename(filename);
      if (safeName !== filename) {
        logger.warn(`Blocked path traversal in upload filename: ${filename}`);
        return;
      }
      const filePath = path.join(UPLOADS_DIR, safeName);
      const metaPath = path.join(metaDir, `${safeName}.json`);

      // Delete the file
      try {
        await fs.promises.unlink(filePath);
        logger.info(`Deleted upload file: ${filename}`);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error(`Failed to delete upload file: ${filename}`, {
            error: (err as Error).message,
          });
        }
      }

      // Delete metadata file
      try {
        await fs.promises.unlink(metaPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error(`Failed to delete meta file: ${filename}.json`, {
            error: (err as Error).message,
          });
        }
      }
    }),
  );
}

/**
 * Clean up expired broadcast files
 * Called by scheduler to remove files from expired/deleted broadcasts
 */
export async function cleanupExpiredBroadcastFiles(database: Database.Database): Promise<void> {
  const query = `
        SELECT id, message FROM broadcasts 
        WHERE (expires_at IS NOT NULL AND expires_at < datetime('now'))
           OR deleted_at IS NOT NULL
    `;

  try {
    const rows = database.prepare(query).all() as Array<{ id: number; message: string }>;

    let fileCount = 0;
    for (const row of rows) {
      // Decrypt message before extracting file paths (messages are AES-256-CBC encrypted)
      let plainMessage: string;
      try {
        plainMessage = decrypt(row.message) ?? '';
      } catch {
        plainMessage = row.message; // Legacy plaintext fallback
      }
      const filenames = extractUploadPaths(plainMessage);
      fileCount += filenames.length;
      await deleteUploadedFilesFromMessage(plainMessage);
    }

    if (fileCount > 0) {
      logger.info(`Cleaned up ${fileCount} files from ${rows.length} expired/deleted broadcasts`);
    }
  } catch (err) {
    logger.error('Error fetching expired broadcasts for cleanup', {
      error: (err as Error).message,
    });
  }
}

/**
 * Clean up expired chat room files
 * Called by scheduler to remove files from expired chat rooms
 */
export async function cleanupExpiredChatRoomFiles(
  database: Database.Database,
  decryptFn: (text: string) => string,
): Promise<void> {
  const roomQuery = `
        SELECT id FROM chat_rooms 
        WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    `;

  try {
    const rooms = database.prepare(roomQuery).all() as Array<{ id: number }>;

    if (rooms.length === 0) return;

    const roomIds = rooms.map((r) => r.id);
    const placeholders = roomIds.map(() => '?').join(',');

    // Get all messages from expired rooms
    const msgQuery = `SELECT message FROM chat_messages WHERE room_id IN (${placeholders})`;
    const messages = database.prepare(msgQuery).all(...roomIds) as Array<{ message: string }>;

    let fileCount = 0;
    for (const msg of messages) {
      const decrypted = decryptFn(msg.message);
      const filenames = extractUploadPaths(decrypted);
      fileCount += filenames.length;
      await deleteUploadedFilesFromMessage(decrypted);
    }

    if (fileCount > 0) {
      logger.info(`Cleaned up ${fileCount} files from ${rooms.length} expired chat rooms`);
    }

    // Delete the expired rooms and their data using transaction
    const deleteRoomsTransaction = database.transaction(() => {
      database
        .prepare(`DELETE FROM chat_messages WHERE room_id IN (${placeholders})`)
        .run(...roomIds);
      database
        .prepare(`DELETE FROM chat_room_members WHERE room_id IN (${placeholders})`)
        .run(...roomIds);
      const result = database
        .prepare(`DELETE FROM chat_rooms WHERE id IN (${placeholders})`)
        .run(...roomIds);
      return result.changes;
    });

    const changes = deleteRoomsTransaction();
    if (changes > 0) {
      logger.info(`Deleted ${changes} expired chat rooms`);
    }
  } catch (err) {
    logger.error('Error cleaning up expired chat rooms', { error: (err as Error).message });
  }
}

/**
 * Delete orphaned files that are older than specified days
 */
export async function cleanupOrphanedFiles(daysOld: number = 30): Promise<void> {
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const metaDir = path.join(UPLOADS_DIR, '.meta');

  let files: string[];
  try {
    files = await fs.promises.readdir(UPLOADS_DIR);
  } catch (err) {
    logger.error('Error reading uploads directory', { error: (err as Error).message });
    return;
  }

  let deletedCount = 0;
  for (const file of files) {
    if (file === '.gitkeep' || file === '.meta') continue;

    const filePath = path.join(UPLOADS_DIR, file);

    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs < cutoffTime) {
        await fs.promises.unlink(filePath);
        logger.info(`Deleted orphaned file: ${file}`);
        deletedCount++;

        // Also delete metadata
        const metaPath = path.join(metaDir, `${file}.json`);
        await fs.promises.unlink(metaPath).catch(() => {});
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Error processing orphaned file: ${file}`, {
          error: (err as Error).message,
        });
      }
    }
  }

  if (deletedCount > 0) {
    logger.info(`Cleaned up ${deletedCount} orphaned files`);
  }
}

/**
 * Clean up expired files based on metadata expiresAt
 * Called by scheduler to remove files that have exceeded their expiration date
 */
export async function cleanupExpiredFilesFromMetadata(): Promise<void> {
  const metaDir = path.join(UPLOADS_DIR, '.meta');
  const now = new Date();

  let files: string[];
  try {
    files = await fs.promises.readdir(metaDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Error reading meta directory', { error: (err as Error).message });
    }
    return;
  }

  const deletePromises: Promise<number>[] = [];

  for (const metaFile of files) {
    if (!metaFile.endsWith('.json')) continue;

    const metaPath = path.join(metaDir, metaFile);

    try {
      const metaContent = await fs.promises.readFile(metaPath, 'utf8');
      const metadata = JSON.parse(metaContent) as { expiresAt?: string };

      if (metadata.expiresAt) {
        const expiresAt = new Date(metadata.expiresAt);

        if (expiresAt < now) {
          const filename = metaFile.replace('.json', '');
          const filePath = path.join(UPLOADS_DIR, filename);

          const deletePromise = fs.promises
            .unlink(filePath)
            .then(() => {
              logger.info(`Deleted expired file: ${filename}`);
              return 1;
            })
            .catch(() => 0)
            .finally(() => {
              fs.promises.unlink(metaPath).catch(() => {});
            }) as Promise<number>;

          deletePromises.push(deletePromise);
        }
      }
    } catch (e) {
      logger.warn(`Failed to parse metadata file: ${metaFile}`, { error: (e as Error).message });
    }
  }

  const results = await Promise.all(deletePromises);
  const deletedCount = results.reduce((sum, val) => sum + val, 0);

  if (deletedCount > 0) {
    logger.info(`Cleaned up ${deletedCount} expired files`);
  }
}
