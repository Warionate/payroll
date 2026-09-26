import { apiClient, getData, getResponse } from './client';
import type { FixedShift } from '../types';

export const fetchFixedShifts = () =>
  apiClient.get<{ data: FixedShift[] }>('/fixed_shifts').then(getData);

export const createFixedShift = (data: Partial<FixedShift>) =>
  apiClient.post('/fixed_shifts', data).then(getResponse);

export const deleteFixedShift = (id: number) => apiClient.delete(`/fixed_shifts/${id}`);

export const bulkSyncFixedShifts = (shifts: Partial<FixedShift>[]) =>
  apiClient.put('/fixed_shifts/bulk', { shifts }).then(getResponse);

export const applyFixedShifts = (year: number, month: number) =>
  apiClient.post('/apply_fixed_shifts', { year, month }).then(getResponse);
