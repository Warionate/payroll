import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { normalizeOriginalName } from '../utils/normalizeOriginalName.js';
import { resolveUploadAccess } from '../middleware/uploadAccess.js';
import { createSqliteRateLimitStore } from '../utils/rateLimitStore.js';
import {
  ALLOWED_OCTET_EXTS,
  resolveSafeExtension,
  validateMagicBytes,
} from '../utils/uploadValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

interface FileMetadata {
  originalName: string;
  mimetype: string;
  size: number;
  originalSize?: number;
  wasCompressed: boolean;
  uploadedAt: string;
  uploadedBy: number;
  expiresAt: string;
  missing?: boolean;
}

// Upload directory
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
const metaDir = path.join(uploadDir, '.meta');

// Image types that will be converted to WebP
const CONVERTIBLE_IMAGES = ['image/jpeg', 'image/png', 'image/gif'];
const IMAGE_QUALITY = 80;
const MAX_IMAGE_WIDTH = 1920;

// Ensure directories exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(metaDir)) {
  fs.mkdirSync(metaDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(16).toString('hex');
    // 拡張子は MIME から決定（originalname は信用しない）
    const ext = resolveSafeExtension(file);
    cb(null, uniqueSuffix + ext);
  },
});

// File filter
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const docTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ];

  const allowedTypes = [...imageTypes, ...docTypes];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  if (file.mimetype === 'application/octet-stream' && ALLOWED_OCTET_EXTS.includes(ext)) {
    cb(null, true);
    return;
  }

  cb(new Error('許可されていないファイル形式です'));
};

// Multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// File size tiers for expiration
const FILE_SIZE_TIERS = [
  { maxSize: 2 * 1024 * 1024, expirationDays: 30 },
  { maxSize: 5 * 1024 * 1024, expirationDays: 14 },
  { maxSize: 10 * 1024 * 1024, expirationDays: 7 },
];

function getExpirationForFileSize(fileSize: number): {
  expirationDays: number;
  requiresConfirmation: boolean;
} {
  for (const tier of FILE_SIZE_TIERS) {
    if (fileSize <= tier.maxSize) {
      const requiresConfirmation = fileSize > 2 * 1024 * 1024;
      return { expirationDays: tier.expirationDays, requiresConfirmation };
    }
  }
  return { expirationDays: 7, requiresConfirmation: true };
}

// 画像変換 (sharp) は CPU 負荷が高いため、ユーザー単位でアップロード回数を制限する
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `user:${req.user!.id}`,
  store: createSqliteRateLimitStore('upload'),
  message: { error: 'アップロードが多すぎます。しばらくお待ちください。' },
});

// All routes require authentication for upload
router.post(
  '/',
  authenticateToken,
  uploadLimiter,
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'ファイルがアップロードされていません' });
      return;
    }

    try {
      let finalFilename = req.file.filename;
      let finalSize = req.file.size;
      let finalMimetype = req.file.mimetype;
      let wasCompressed = false;
      const originalSize = req.file.size;
      const filePath = path.join(uploadDir, req.file.filename);
      const skipCompression = req.body.skipCompression === 'true';

      // Validate magic bytes for all uploads — the declared mimetype is
      // client-controlled, so verify the actual file content matches the
      // server-resolved stored extension (unknown extensions like .txt/.csv
      // pass through). Checking the stored extension (not originalname) ensures
      // the bytes match the type the file will actually be served as.
      {
        const ext = path.extname(req.file.filename).toLowerCase();
        if (!validateMagicBytes(filePath, ext)) {
          fs.unlinkSync(filePath);
          res.status(400).json({ error: '許可されていないファイル形式です' });
          return;
        }
      }

      // Convert convertible images to WebP (unless skipCompression is set)
      if (CONVERTIBLE_IMAGES.includes(req.file.mimetype) && !skipCompression) {
        const ext = path.extname(req.file.filename);
        const newFilename = req.file.filename.replace(ext, '.webp');
        const outputPath = path.join(uploadDir, newFilename);

        // animated: GIF は全フレームを読み込んでアニメーションを保持する
        // （指定しないと最初の1フレームだけの静止画 WebP になる）
        await sharp(filePath, { animated: req.file.mimetype === 'image/gif' })
          .resize(MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: IMAGE_QUALITY })
          .toFile(outputPath);

        const stats = fs.statSync(outputPath);
        finalSize = stats.size;
        finalFilename = newFilename;
        finalMimetype = 'image/webp';
        wasCompressed = true;

        fs.unlinkSync(filePath);

        logger.info('Image compressed', {
          original: req.file.filename,
          compressed: newFilename,
          originalSize,
          finalSize,
          reduction: `${Math.round((1 - finalSize / originalSize) * 100)}%`,
        });
      }

      // Calculate expiration based on final file size
      const { expirationDays, requiresConfirmation } = getExpirationForFileSize(finalSize);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const normalizedOriginalName = normalizeOriginalName(req.file.originalname);

      // Save metadata
      const metaPath = path.join(metaDir, `${finalFilename}.json`);
      const metadata: FileMetadata = {
        originalName: normalizedOriginalName,
        mimetype: finalMimetype,
        size: finalSize,
        originalSize: wasCompressed ? originalSize : undefined,
        wasCompressed,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user!.id,
        expiresAt: expiresAt.toISOString(),
      };
      await fs.promises.writeFile(metaPath, JSON.stringify(metadata));

      const fileUrl = `/uploads/${finalFilename}`;

      res.json({
        url: fileUrl,
        filename: finalFilename,
        originalName: normalizedOriginalName,
        mimetype: finalMimetype,
        size: finalSize,
        originalSize: wasCompressed ? originalSize : undefined,
        wasCompressed,
        compressionRatio: wasCompressed ? Math.round((1 - finalSize / originalSize) * 100) : 0,
        expiresAt: expiresAt.toISOString(),
        expirationDays,
        requiresConfirmation,
      });
    } catch (err) {
      const error = err as Error;
      logger.error('Upload processing failed', { error: error.message, stack: error.stack });

      // 変換途中で失敗した場合に孤児ファイルを残さない
      if (req.file) {
        const originalPath = path.join(uploadDir, req.file.filename);
        const webpPath = path.join(
          uploadDir,
          req.file.filename.replace(path.extname(req.file.filename), '.webp'),
        );
        for (const p of [originalPath, webpPath]) {
          try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch {
            // best-effort cleanup
          }
        }
      }

      res.status(500).json({ error: '画像処理に失敗しました' });
    }
  },
);

/**
 * Download file with original filename
 * GET /api/uploads/download/:filename
 */
router.get('/download/:filename', authenticateToken, async (req: Request, res: Response) => {
  const filename = req.params.filename as string;

  // Security check: prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    res.status(400).json({ error: '不正なファイル名です' });
    return;
  }

  // filename は直前で .. / \ を拒否し、直後で uploadDir 配下かを確かめている
  // nosemgrep: javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal
  const filePath = path.resolve(uploadDir, filename);

  // Verify file is within upload directory (security)
  if (!filePath.startsWith(path.resolve(uploadDir))) {
    res.status(400).json({ error: '不正なパスです' });
    return;
  }

  try {
    await fs.promises.access(filePath);
  } catch (_e) {
    res.status(404).json({ error: 'ファイルが見つかりません' });
    return;
  }

  // Access control is shared with the static /uploads middleware (A-2), so the
  // owner check and deny-by-default behavior stay identical across both paths.
  const decision = await resolveUploadAccess(req.user!, filename);
  if (!decision.allowed) {
    res.status(decision.status).json({
      error: decision.status === 403 ? 'アクセス権限がありません' : 'ファイルが見つかりません',
    });
    return;
  }

  const originalName = normalizeOriginalName(decision.metadata?.originalName || filename);
  const mimetype = decision.metadata?.mimetype || 'application/octet-stream';
  const safeName = path.basename(originalName || filename);
  res.type(mimetype);

  res.download(filePath, safeName, (err) => {
    if (err) {
      logger.error('sendFile error:', { error: (err as Error).message, filename });
      if (!res.headersSent) {
        res.status(500).json({ error: 'ファイル送信エラー' });
      }
    }
  });
});

// Error handling middleware for multer
router.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'ファイルサイズが大きすぎます（最大10MB）' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  } else if (err) {
    res.status(400).json({ error: err.message });
    return;
  }
  next();
});

export default router;
