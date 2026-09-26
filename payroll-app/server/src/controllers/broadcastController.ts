/**
 * Broadcast Controller - broadcast CRUD, read tracking, unread counts
 *
 * Admin authorization is enforced at the route level via the `requireAdmin`
 * middleware (see routes/chat/broadcasts.ts), so admin-only handlers below
 * assume the request has already passed that check.
 */
import type { Request, Response } from 'express';
import { broadcastService } from '../services/broadcastService.js';

export const broadcastController = {
  getAll(req: Request, res: Response) {
    const data = broadcastService.getAll(req.user!.id, req.user!.role === 'admin');
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const id = broadcastService.create(req.user!.id, req.body);
    res.json({ message: 'Broadcast sent', id });
  },

  delete(req: Request, res: Response) {
    broadcastService.delete(parseInt(req.params.id as string, 10));
    res.json({ message: 'Broadcast deleted' });
  },

  update(req: Request, res: Response) {
    const changes = broadcastService.update(parseInt(req.params.id as string, 10), req.body);
    if (changes === 0) {
      res.status(404).json({ error: 'お知らせが見つかりません' });
      return;
    }
    res.json({ message: 'Broadcast updated', id: req.params.id });
  },

  markAsRead(req: Request, res: Response) {
    broadcastService.markAsRead(req.user!.id, parseInt(req.params.id as string, 10));
    res.json({ message: 'marked as read' });
  },

  getReaders(req: Request, res: Response) {
    const data = broadcastService.getReaders(parseInt(req.params.id as string, 10));
    res.json({ data });
  },

  getUnreadCounts(req: Request, res: Response) {
    const payload = broadcastService.getUnreadCounts(req.user!.id);
    res.json(payload);
  },
};
