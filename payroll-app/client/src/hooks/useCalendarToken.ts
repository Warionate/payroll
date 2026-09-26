import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCalendarToken, resetCalendarToken } from '../api';

import { useAuth } from '../contexts/AuthContext';

export const useCalendarToken = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['calendarToken', { userId: user?.id }],
    queryFn: fetchCalendarToken,
    staleTime: Infinity, // Token doesn't change unless reset
    enabled: !!user?.id,
  });

  const resetMutation = useMutation({
    mutationFn: resetCalendarToken,
    onSuccess: (data) => {
      queryClient.setQueryData(['calendarToken', { userId: user?.id }], data);
    },
  });

  return { ...query, resetMutation };
};
