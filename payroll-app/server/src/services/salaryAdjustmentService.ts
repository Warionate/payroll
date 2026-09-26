/**
 * Salary Adjustment Service
 */
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { salaryAdjustmentRepository } from '../repositories/salaryAdjustmentRepository.js';

export const salaryAdjustmentService = {
  getByUserId(userId: number, year?: string) {
    return salaryAdjustmentRepository.findByUserId(userId, year);
  },

  create(
    userId: number,
    data: { year_month: string; adjustment_type: string; amount: number; note?: string },
  ): number | bigint {
    const id = salaryAdjustmentRepository.create(
      userId,
      data.year_month,
      data.adjustment_type,
      data.amount,
      data.note || null,
    );
    cache.invalidatePrefix(`salary_adjustments:${userId}`);
    logger.info('Salary adjustment created', {
      userId,
      yearMonth: data.year_month,
      type: data.adjustment_type,
      amount: data.amount,
    });
    return id;
  },

  update(
    id: string | number,
    userId: number,
    data: { year_month: string; adjustment_type: string; amount: number; note?: string },
  ): number {
    const changes = salaryAdjustmentRepository.update(
      id,
      userId,
      data.year_month,
      data.adjustment_type,
      data.amount,
      data.note || null,
    );
    cache.invalidatePrefix(`salary_adjustments:${userId}`);
    logger.info('Salary adjustment updated', { userId, adjustmentId: id });
    return changes;
  },

  delete(id: string | number, userId: number): number {
    const changes = salaryAdjustmentRepository.delete(id, userId);
    cache.invalidatePrefix(`salary_adjustments:${userId}`);
    logger.info('Salary adjustment deleted', { userId, adjustmentId: id });
    return changes;
  },
};
