import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  fetchScheduleEvents,
  createScheduleEvent,
  updateScheduleEvent,
  deleteScheduleEvent,
} from '../api';
import type { CreateScheduleEventInput } from '../types';
import { useAuth } from '../contexts/AuthContext';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export const useScheduleEvents = (startDate?: string, endDate?: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['scheduleEvents', { startDate, endDate }],
    queryFn: () => fetchScheduleEvents(startDate, endDate),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
    enabled: !!user?.id,
  });
};

export const useScheduleEventMutation = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scheduleEvents'] });

  return {
    createMutation: useMutation({
      mutationFn: (data: CreateScheduleEventInput) => createScheduleEvent(data),
      onSuccess: invalidate,
    }),
    updateMutation: useMutation({
      mutationFn: ({ id, data }: { id: number; data: CreateScheduleEventInput }) =>
        updateScheduleEvent(id, data),
      onSuccess: invalidate,
    }),
    deleteMutation: useMutation({
      mutationFn: (id: number) => deleteScheduleEvent(id),
      onSuccess: invalidate,
    }),
  };
};
