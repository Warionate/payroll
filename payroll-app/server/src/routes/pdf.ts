/**
 * PDF - route definitions (delegates to controller)
 */
import express from 'express';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import { pdfController } from '../controllers/pdfController.js';
import { createSqliteRateLimitStore } from '../utils/rateLimitStore.js';

const router = express.Router();

// PDF 生成はフォントサブセット化など CPU 負荷が高いため、ユーザー単位で制限する
const pdfLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `user:${req.user!.id}`,
  store: createSqliteRateLimitStore('pdf'),
  message: { error: 'PDF生成のリクエストが多すぎます。しばらくお待ちください。' },
});

router.get('/salary/:year/:month', authenticateToken, pdfLimiter, pdfController.generateSalaryPdf);

export default router;
