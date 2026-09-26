/**
 * WorkLog Controller - handles HTTP request/response for work log management
 */
import type { Request, Response } from 'express';
import { workLogService } from '../services/workLogService.js';

export const workLogController = {
  getAll(req: Request, res: Response) {
    const { start_date, end_date } = req.query;
    const data = workLogService.getByUserAndDateRange(
      req.user!.id,
      start_date ? String(start_date) : undefined,
      end_date ? String(end_date) : undefined,
    );
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const id = workLogService.create(req.user!.id, req.body);
    res.json({ message: 'success', id });
  },

  update(req: Request, res: Response) {
    const changes = workLogService.update(
      parseInt(req.params.id as string, 10),
      req.user!.id,
      req.body,
    );
    res.json({ message: 'updated', changes });
  },

  delete(req: Request, res: Response) {
    const changes = workLogService.delete(parseInt(req.params.id as string, 10), req.user!.id);
    res.json({ message: 'deleted', changes });
  },

  updateStatus(req: Request, res: Response) {
    const { status } = req.body;
    const changes = workLogService.updateStatus(
      parseInt(req.params.id as string, 10),
      req.user!.id,
      status,
    );
    res.json({ message: 'updated', changes });
  },

  bulkSave(req: Request, res: Response) {
    const { date, classes, managed_slot_ids } = req.body;
    workLogService.bulkSave(req.user!.id, date, classes, managed_slot_ids);
    res.json({ message: 'success' });
  },

  completeAll(req: Request, res: Response) {
    const { start_date, end_date } = req.body;
    const changes = workLogService.completeAllInRange(req.user!.id, start_date, end_date);
    res.json({ message: 'updated', changes });
  },
};
