/**
 * Schedule Event Controller - 塾内予定 HTTP layer
 *
 * Admin authorization is enforced at the route level via the `requireAdmin`
 * middleware (see routes/schedule_events.ts), so admin-only handlers below
 * assume the request has already passed that check.
 */
import type { Request, Response } from 'express';
import { scheduleEventService } from '../services/scheduleEventService.js';

export const scheduleEventController = {
  getAll(req: Request, res: Response) {
    const startDate = req.query.start_date ? String(req.query.start_date) : undefined;
    const endDate = req.query.end_date ? String(req.query.end_date) : undefined;
    const data = scheduleEventService.getAll(startDate, endDate);
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const event = scheduleEventService.create(req.user!.id, req.body);
    res.status(201).json({ data: event });
  },

  update(req: Request, res: Response) {
    const id = parseInt(req.params.id as string, 10);
    const event = scheduleEventService.update(id, req.body);
    if (!event) {
      res.status(404).json({ error: '予定が見つかりません' });
      return;
    }
    res.json({ data: event });
  },

  delete(req: Request, res: Response) {
    const id = parseInt(req.params.id as string, 10);
    const changes = scheduleEventService.delete(id);
    if (changes === 0) {
      res.status(404).json({ error: '予定が見つかりません' });
      return;
    }
    res.json({ message: 'deleted' });
  },
};
