/**
 * Chat module.
 *
 * The 1:1 / group chat feature has been removed (G章). The room/message
 * endpoints are blocked with 410 Gone here — the UI no longer reaches them and
 * the underlying route/controller implementations are removed in a later phase.
 * Only announcements (broadcasts) and the unread endpoint remain, kept at their
 * original `/api/chat/*` URLs for backward compatibility (SW cache patterns and
 * older clients).
 */
import express from 'express';
import type { Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import broadcastsRouter from './broadcasts.js';

const router = express.Router();

// All chat routes require authentication
router.use(authenticateToken);

// G-1: 撤去済みのルーム/メッセージ系エンドポイントを 410 Gone で遮断する。
const chatGone = (_req: Request, res: Response) => {
  res.status(410).json({ error: 'チャット機能は廃止されました' });
};
const removedPaths = [
  '/users',
  '/rooms',
  '/rooms/:roomId',
  '/rooms/:roomId/read',
  '/rooms/:roomId/members',
  '/rooms/:roomId/members/:userId',
  '/rooms/:roomId/messages',
  '/messages/:id',
];
for (const path of removedPaths) {
  router.all(path, chatGone);
}

// Announcements (broadcasts) + unread — still active
router.use('/', broadcastsRouter);

export default router;
