import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  fetchWorkLogs,
  createWorkLog,
  updateWorkLog,
  deleteWorkLog,
  updateWorkLogStatus,
  saveDailyClasses,
  completeAllWorkLogs,
} from '../api';
import type { CreateWorkLogInput } from '../types';
import { useAuth } from '../contexts/AuthContext';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export const useWorkLogs = (startDate: string, endDate: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workLogs', { startDate, endDate, userId: user?.id }],
    queryFn: () => fetchWorkLogs(startDate, endDate),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
    enabled: !!user?.id,
  });
};

export const useWorkLogMutation = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workLogs'] });

  return {
    createMutation: useMutation({ mutationFn: createWorkLog, onSuccess: invalidate }),
    updateMutation: useMutation({
      mutationFn: ({ id, data }: { id: number; data: Partial<CreateWorkLogInput> }) =>
        updateWorkLog(id, data),
      onSuccess: invalidate,
    }),
    deleteMutation: useMutation({ mutationFn: deleteWorkLog, onSuccess: invalidate }),
    statusMutation: useMutation({
      mutationFn: ({ id, status }: { id: number; status: string }) =>
        updateWorkLogStatus(id, status),
      onSuccess: invalidate,
    }),
    completeAllMutation: useMutation({
      mutationFn: ({ start_date, end_date }: { start_date: string; end_date: string }) =>
        completeAllWorkLogs(start_date, end_date),
      onSuccess: invalidate,
    }),
    bulkSaveMutation: useMutation({
      mutationFn: ({
        date,
        classes,
        managed_slot_ids,
      }: {
        date: string;
        classes: CreateWorkLogInput[];
        managed_slot_ids: number[];
      }) => saveDailyClasses(date, classes, managed_slot_ids),
      onSuccess: invalidate,
    }),
  };
};
