import { apiClient, getData, getResponse } from './client';
import type { PatternAssignment, SchedulePattern } from '../types';

export const fetchPatterns = () =>
  apiClient.get<{ data: SchedulePattern[] }>('/patterns').then(getData);

export const createPattern = (name: string) =>
  apiClient.post('/patterns', { name }).then(getResponse);

export const updatePattern = (id: number, name: string) =>
  apiClient.put(`/patterns/${id}`, { name }).then(getResponse);

export const deletePattern = (id: number) => apiClient.delete(`/patterns/${id}`);

export const setPatternArchived = (id: number, archived: boolean) =>
  apiClient.patch(`/patterns/${id}/archive`, { archived }).then(getResponse);

export const createSlot = (data: Record<string, unknown>) =>
  apiClient.post('/slots', data).then(getResponse);

export const createBulkSlots = (data: Record<string, unknown>) =>
  apiClient.post('/slots/bulk', data).then(getResponse);

export const updateSlot = (id: number, data: Record<string, unknown>) =>
  apiClient.put(`/slots/${id}`, data).then(getResponse);

export const deleteSlot = (id: number) => apiClient.delete(`/slots/${id}`);

// --- Pattern Assignments ---
export const fetchPatternAssignments = () =>
  apiClient.get<{ data: PatternAssignment[] }>('/pattern_assignments').then(getData);

export const createPatternAssignment = (data: Record<string, unknown>) =>
  apiClient.post('/pattern_assignments', data).then(getResponse);

export const deletePatternAssignment = (id: number) =>
  apiClient.delete(`/pattern_assignments/${id}`).then(getResponse);
