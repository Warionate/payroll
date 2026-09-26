import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSalaryAdjustments,
  createSalaryAdjustment,
  updateSalaryAdjustment,
  deleteSalaryAdjustment,
} from '../api';
import type { SalaryAdjustment } from '../types';
import { useAuth } from '../contexts/AuthContext';

/**
 * 給与調整データ取得フック
 */
export const useSalaryAdjustments = (year?: number) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['salaryAdjustments', { userId: user?.id, year }],
    queryFn: () => fetchSalaryAdjustments(year),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user?.id,
  });
};

/**
 * 給与調整 CRUD操作フック
 */
export const useSalaryAdjustmentMutation = () => {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createSalaryAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salaryAdjustments'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SalaryAdjustment> }) =>
      updateSalaryAdjustment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salaryAdjustments'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSalaryAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salaryAdjustments'] });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
