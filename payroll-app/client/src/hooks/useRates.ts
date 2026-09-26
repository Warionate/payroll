import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRates, createRate, updateRate, deleteRate } from '../api';
import type { Rate, RateInput } from '../types';

import { useAuth } from '../contexts/AuthContext';

export const useRates = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['rates', { userId: user?.id }],
    queryFn: () => fetchRates() as Promise<Rate[]>,
    staleTime: 1000 * 60 * 60, // 1 hour (rates don't change often)
    enabled: !!user?.id,
  });
};

export const useRateMutation = () => {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rates'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RateInput> }) => updateRate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rates'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rates'] });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
