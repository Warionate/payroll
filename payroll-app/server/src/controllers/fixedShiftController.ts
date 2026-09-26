/**
 * Fixed Shift Controller - handles HTTP request/response for fixed shift management
 */
import type { Request, Response } from 'express';
import { fixedShiftService } from '../services/scheduleService.js';

export const fixedShiftController = {
  getAll(req: Request, res: Response) {
    const data = fixedShiftService.getByUserId(req.user!.id);
    res.json({ data });
  },

  create(req: Request, res: Response) {
    const { day_of_week, schedule_slot_id, student_count } = req.body;

    const day = Number(day_of_week);
    const slotId = Number(schedule_slot_id);
    const studentCount = Number(student_count);

    if (
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6 ||
      !Number.isInteger(slotId) ||
      slotId < 1 ||
      !Number.isInteger(studentCount) ||
      studentCount < 1 ||
      studentCount > 4
    ) {
      res.status(400).json({ error: '必須項目が不足しています' });
      return;
    }

    const id = fixedShiftService.create(req.user!.id, day, slotId, studentCount);
    res.json({ message: 'success', id });
  },

  bulkReplace(req: Request, res: Response) {
    const { shifts } = req.body;

    if (!Array.isArray(shifts)) {
      res.status(400).json({ error: 'shifts は配列で指定してください' });
      return;
    }

    if (shifts.length > 100) {
      res.status(400).json({ error: 'shifts は一度に最大100件までです' });
      return;
    }

    for (const s of shifts) {
      const day = Number(s.day_of_week);
      const slotId = Number(s.schedule_slot_id);
      const studentCount = Number(s.student_count);
      if (
        !Number.isInteger(day) ||
        day < 0 ||
        day > 6 ||
        !Number.isInteger(slotId) ||
        slotId < 1 ||
        !Number.isInteger(studentCount) ||
        studentCount < 1 ||
        studentCount > 4
      ) {
        res.status(400).json({ error: '各シフトには曜日・コマ・生徒数の指定が必要です' });
        return;
      }
    }

    fixedShiftService.bulkReplace(req.user!.id, shifts);
    res.json({ message: 'success', count: shifts.length });
  },

  delete(req: Request, res: Response) {
    const changes = fixedShiftService.delete(parseInt(req.params.id as string, 10), req.user!.id);
    res.json({ message: 'deleted', rows: changes });
  },
};
