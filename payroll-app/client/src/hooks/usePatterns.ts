import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPatterns,
  createPattern,
  updatePattern,
  deletePattern,
  setPatternArchived,
  createSlot,
  createBulkSlots,
  updateSlot,
  deleteSlot,
  fetchFixedShifts,
  createFixedShift,
  deleteFixedShift,
  bulkSyncFixedShifts,
  applyFixedShifts,
  fetchPatternAssignments,
  createPatternAssignment,
  deletePatternAssignment,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

const STALE_TIME = 30 * 60 * 1000; // 30 minutes

// ユーザースコープのクエリ設定を生成
const useUserQuery = <TData>(queryKey: string, queryFn: () => Promise<TData>) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [queryKey, { userId: user?.id }],
    queryFn,
    staleTime: STALE_TIME,
    enabled: !!user?.id,
  });
};

// --- Patterns ---
export const usePatterns = () => useUserQuery('patterns', fetchPatterns);

export const usePatternMutation = () => {
  const queryClient = useQueryClient();
  // Use partial match to invalidate queries with userId suffix
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['patterns'] });

  return {
    createPatternMutation: useMutation({ mutationFn: createPattern, onSuccess: invalidate }),
    updatePatternMutation: useMutation({
      mutationFn: ({ id, name }: { id: number; name: string }) => updatePattern(id, name),
      onSuccess: invalidate,
    }),
    deletePatternMutation: useMutation({ mutationFn: deletePattern, onSuccess: invalidate }),
    setPatternArchivedMutation: useMutation({
      mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
        setPatternArchived(id, archived),
      onSuccess: invalidate,
    }),
    createSlotMutation: useMutation({ mutationFn: createSlot, onSuccess: invalidate }),
    createBulkSlotsMutation: useMutation({ mutationFn: createBulkSlots, onSuccess: invalidate }),
    updateSlotMutation: useMutation({
      mutationFn: ({ id, ...data }: { id: number; [key: string]: unknown }) => updateSlot(id, data),
      onSuccess: invalidate,
    }),
    deleteSlotMutation: useMutation({ mutationFn: deleteSlot, onSuccess: invalidate }),
  };
};

// --- Fixed Shifts ---
export const useFixedShifts = () => useUserQuery('fixedShifts', fetchFixedShifts);

export const useFixedShiftMutation = () => {
  const queryClient = useQueryClient();

  return {
    createMutation: useMutation({
      mutationFn: createFixedShift,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fixedShifts'] }),
    }),
    deleteMutation: useMutation({
      mutationFn: deleteFixedShift,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fixedShifts'] }),
    }),
    bulkSyncMutation: useMutation({
      mutationFn: bulkSyncFixedShifts,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fixedShifts'] }),
    }),
    applyMutation: useMutation({
      mutationFn: ({ year, month }: { year: number; month: number }) =>
        applyFixedShifts(year, month),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workLogs'] }),
    }),
  };
};

// --- Pattern Assignments ---
export const usePatternAssignments = () =>
  useUserQuery('patternAssignments', fetchPatternAssignments);

export const usePatternAssignmentMutation = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['patternAssignments'] });
  const invalidateWithWorkLogs = () => {
    queryClient.invalidateQueries({ queryKey: ['patternAssignments'] });
    queryClient.invalidateQueries({ queryKey: ['workLogs'] });
  };

  return {
    createMutation: useMutation({
      mutationFn: createPatternAssignment,
      onSuccess: invalidateWithWorkLogs,
    }),
    deleteMutation: useMutation({ mutationFn: deletePatternAssignment, onSuccess: invalidate }),
  };
};
