/**
 * Rate Service - salary rate management with encryption
 */
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { rateRepository, type RateRow } from '../repositories/rateRepository.js';

export interface DecryptedRate {
  id: number;
  user_id: number;
  start_date: string;
  wage_1_student: string | null | undefined;
  wage_2_students: string | null | undefined;
  wage_3_students: string | null | undefined;
  wage_4_students: string | null | undefined;
  hourly_wage: string | null | undefined;
  allowance_day: string | null | undefined;
  allowance_gap: string | null | undefined;
  is_active: number;
}

function decryptRate(row: RateRow): DecryptedRate {
  return {
    ...row,
    wage_1_student: decrypt(row.wage_1_student),
    wage_2_students: decrypt(row.wage_2_students),
    wage_3_students: decrypt(row.wage_3_students),
    wage_4_students: decrypt(row.wage_4_students),
    hourly_wage: decrypt(row.hourly_wage),
    allowance_day: decrypt(row.allowance_day),
    allowance_gap: decrypt(row.allowance_gap),
  };
}

export const rateService = {
  getByUserId(userId: number): DecryptedRate[] {
    const rows = rateRepository.findByUserId(userId);
    return rows.map(decryptRate);
  },

  create(
    userId: number,
    data: {
      start_date: string;
      wage_1_student: string | number;
      wage_2_students: string | number;
      wage_3_students: string | number;
      wage_4_students: string | number;
      hourly_wage: string | number;
      allowance_day: string | number;
      allowance_gap: string | number;
    },
  ): number | bigint {
    const id = rateRepository.create(
      userId,
      data.start_date,
      encrypt(data.wage_1_student),
      encrypt(data.wage_2_students),
      encrypt(data.wage_3_students),
      encrypt(data.wage_4_students),
      encrypt(data.hourly_wage),
      encrypt(data.allowance_day),
      encrypt(data.allowance_gap),
    );
    cache.invalidateUser(userId);
    logger.info(`Rates created for user ${userId}`);
    return id;
  },

  update(
    id: string | number,
    userId: number,
    data: {
      start_date: string;
      wage_1_student: string | number;
      wage_2_students: string | number;
      wage_3_students: string | number;
      wage_4_students: string | number;
      hourly_wage: string | number;
      allowance_day: string | number;
      allowance_gap: string | number;
    },
  ): number {
    const changes = rateRepository.update(
      id,
      userId,
      data.start_date,
      encrypt(data.wage_1_student),
      encrypt(data.wage_2_students),
      encrypt(data.wage_3_students),
      encrypt(data.wage_4_students),
      encrypt(data.hourly_wage),
      encrypt(data.allowance_day),
      encrypt(data.allowance_gap),
    );
    cache.invalidateUser(userId);
    logger.info(`Rates updated for user ${userId}, id: ${id}`);
    return changes;
  },

  delete(id: string | number, userId: number): number {
    const changes = rateRepository.delete(id, userId);
    cache.invalidateUser(userId);
    logger.info(`Rates deleted for user ${userId}, id: ${id}`);
    return changes;
  },
};
