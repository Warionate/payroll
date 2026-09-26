import { apiClient, getData, getResponse } from './client';
import type { ScheduleEvent, CreateScheduleEventInput } from '../types';

export const fetchScheduleEvents = (start_date?: string, end_date?: string) =>
  apiClient
    .get<{ data: ScheduleEvent[] }>('/schedule_events', {
      params: { start_date, end_date, _t: Date.now() },
    })
    .then(getData);

export const createScheduleEvent = (data: CreateScheduleEventInput) =>
  apiClient
    .post<{ data: ScheduleEvent }>('/schedule_events', data)
    .then((res) => getResponse(res).data);

export const updateScheduleEvent = (id: number, data: CreateScheduleEventInput) =>
  apiClient
    .put<{ data: ScheduleEvent }>(`/schedule_events/${id}`, data)
    .then((res) => getResponse(res).data);

export const deleteScheduleEvent = (id: number) => apiClient.delete(`/schedule_events/${id}`);
