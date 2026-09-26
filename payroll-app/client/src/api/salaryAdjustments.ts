import { apiClient, getData, getResponse } from './client';
import type { SalaryAdjustment } from '../types';

export const fetchSalaryAdjustments = (year?: number) =>
  apiClient.get('/salary_adjustments', { params: year ? { year } : {} }).then(getData);

export const createSalaryAdjustment = (data: Partial<SalaryAdjustment>) =>
  apiClient.post('/salary_adjustments', data).then(getResponse);

export const updateSalaryAdjustment = (id: number, data: Partial<SalaryAdjustment>) =>
  apiClient.put(`/salary_adjustments/${id}`, data).then(getResponse);

export const deleteSalaryAdjustment = (id: number) =>
  apiClient.delete(`/salary_adjustments/${id}`).then(getResponse);
