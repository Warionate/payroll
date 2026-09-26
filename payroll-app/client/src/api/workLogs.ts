import { apiClient, getData, getResponse } from './client';
import type { CreateWorkLogInput } from '../types';

export const fetchWorkLogs = (start_date: string, end_date: string) =>
  apiClient.get('/work_logs', { params: { start_date, end_date, _t: Date.now() } }).then(getData);

export const createWorkLog = (data: CreateWorkLogInput) =>
  apiClient.post('/work_logs', data).then(getResponse);

export const updateWorkLog = (id: number, data: Partial<CreateWorkLogInput>) =>
  apiClient.put(`/work_logs/${id}`, data).then(getResponse);

export const deleteWorkLog = (id: number) => apiClient.delete(`/work_logs/${id}`);

export const updateWorkLogStatus = (id: number, status: string) =>
  apiClient.patch(`/work_logs/${id}/status`, { status });

export const saveDailyClasses = (
  date: string,
  classes: CreateWorkLogInput[],
  managed_slot_ids: number[],
) => apiClient.post('/work_logs/bulk_save', { date, classes, managed_slot_ids }).then(getResponse);

/** 期間内の未完了ログを一括で「完了」にする */
export const completeAllWorkLogs = (start_date: string, end_date: string) =>
  apiClient.post('/work_logs/complete_all', { start_date, end_date }).then(getResponse);
