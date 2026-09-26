/**
 * Rate Controller - handles HTTP request/response for rate management
 */
import type { Request, Response } from 'express';
import { rateService } from '../services/rateService.js';

export const rateController = {
  getAll(req: Request, res: Response) {
    const data = rateService.getByUserId(req.user!.id);
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const id = rateService.create(req.user!.id, req.body);
    res.json({ message: 'success', id });
  },

  update(req: Request, res: Response) {
    const changes = rateService.update(
      parseInt(req.params.id as string, 10),
      req.user!.id,
      req.body,
    );
    res.json({ message: 'updated', changes });
  },

  delete(req: Request, res: Response) {
    const changes = rateService.delete(parseInt(req.params.id as string, 10), req.user!.id);
    res.json({ message: 'deleted', changes });
  },
};
