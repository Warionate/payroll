/**
 * Salary Adjustment Controller
 */
import type { Request, Response } from 'express';
import { salaryAdjustmentService } from '../services/salaryAdjustmentService.js';

export const salaryAdjustmentController = {
  getAll(req: Request, res: Response) {
    const rawYear = req.query.year ? String(req.query.year) : undefined;
    const year = rawYear && /^\d{4}$/.test(rawYear) ? rawYear : undefined;
    const data = salaryAdjustmentService.getByUserId(req.user!.id, year);
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const id = salaryAdjustmentService.create(req.user!.id, req.body);
    res.json({ message: 'success', id });
  },

  update(req: Request, res: Response) {
    const changes = salaryAdjustmentService.update(
      parseInt(req.params.id as string, 10),
      req.user!.id,
      req.body,
    );
    res.json({ message: 'updated', changes });
  },

  delete(req: Request, res: Response) {
    const changes = salaryAdjustmentService.delete(
      parseInt(req.params.id as string, 10),
      req.user!.id,
    );
    res.json({ message: 'deleted', changes });
  },
};
