/**
 * Schedule Controller - handles HTTP request/response for patterns, slots, assignments
 *
 * Admin authorization is enforced at the route level via the `requireAdmin`
 * middleware (see routes/patterns.ts), so admin-only handlers below assume
 * the request has already passed that check.
 */
import type { Request, Response } from 'express';
import {
  patternService,
  slotService,
  patternAssignmentService,
  fixedShiftService,
} from '../services/scheduleService.js';
import cache from '../utils/cache.js';

export const patternController = {
  getAll(_req: Request, res: Response) {
    const data = patternService.getAll();
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const id = patternService.create(req.body.name, req.user!.username);
    res.json({ message: 'success', id });
  },

  update(req: Request, res: Response) {
    const changes = patternService.updateName(
      parseInt(req.params.id as string, 10),
      req.body.name,
      req.user!.username,
    );
    if (changes === 0) {
      res.status(404).json({ error: 'パターンが見つかりません' });
      return;
    }
    res.json({ message: 'success' });
  },

  delete(req: Request, res: Response) {
    const changes = patternService.delete(
      parseInt(req.params.id as string, 10),
      req.user!.username,
    );
    res.json({ message: 'deleted', rows: changes });
  },

  setArchived(req: Request, res: Response) {
    const changes = patternService.setArchived(
      parseInt(req.params.id as string, 10),
      Boolean(req.body.archived),
      req.user!.username,
    );
    if (changes === 0) {
      res.status(404).json({ error: 'パターンが見つかりません' });
      return;
    }
    res.json({ message: 'success' });
  },
};

export const slotController = {
  create(req: Request, res: Response) {
    const { pattern_id, period_name, start_time, end_time } = req.body;
    const id = slotService.create(pattern_id, period_name, start_time, end_time);
    res.json({ message: 'success', id });
  },

  update(req: Request, res: Response) {
    const { period_name, start_time, end_time } = req.body;
    const changes = slotService.update(
      parseInt(req.params.id as string, 10),
      period_name,
      start_time,
      end_time,
      req.user!.username,
    );
    if (changes === 0) {
      res.status(404).json({ error: 'コマが見つかりません' });
      return;
    }
    res.json({ message: 'success' });
  },

  bulkCreate(req: Request, res: Response) {
    const ids = slotService.bulkCreate(req.body.pattern_id, req.body.slots, req.user!.username);
    res.json({ message: 'success', ids });
  },

  delete(req: Request, res: Response) {
    const changes = slotService.delete(parseInt(req.params.id as string, 10));
    res.json({ message: 'deleted', rows: changes });
  },
};

export const patternAssignmentController = {
  getAll(req: Request, res: Response) {
    const filterUserId = req.query.user_id ? String(req.query.user_id) : undefined;
    const data = patternAssignmentService.getAll(req.user!.id, req.user!.role, filterUserId);
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const result = patternAssignmentService.create(req.user!.id, req.user!.role, req.body);
    res.json({ message: 'success', id: result.id, deleted_work_logs: result.deletedCount });
  },

  delete(req: Request, res: Response) {
    const changes = patternAssignmentService.delete(
      parseInt(req.params.id as string, 10),
      req.user!.id,
      req.user!.role,
    );
    res.json({ message: 'deleted', rows: changes });
  },
};

export const applyFixedShiftsController = {
  apply(req: Request, res: Response) {
    const { year, month } = req.body;

    const count = fixedShiftService.applyForMonth(req.user!.id, year, month);
    if (count === 0) {
      res.json({ message: 'no_settings', count: 0 });
      return;
    }
    cache.invalidatePrefix(`work_logs:${req.user!.id}`);
    res.json({ message: 'success', count });
  },
};
