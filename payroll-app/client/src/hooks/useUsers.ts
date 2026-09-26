import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsers,
  deleteUser,
  updateUserProfile,
  updateUserPassword,
  updateUserRole,
} from '../api';

import { useAuth } from '../contexts/AuthContext';

export const useUsers = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['users', { userId: user?.id }],
    queryFn: fetchUsers,
    staleTime: 1000 * 60 * 5,
    retry: false, // Don't retry if 403
    enabled: !!user?.id,
  });
};

export const useUserMutation = () => {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password?: string }) => deleteUser(id, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, username }: { id: number; username: string }) =>
      updateUserProfile(id, username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const updatePasswordMutation = useMutation({
    mutationFn: ({
      id,
      password,
      currentPassword,
    }: {
      id: number;
      password: string;
      currentPassword?: string;
    }) => updateUserPassword(id, password, currentPassword),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => updateUserRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return {
    deleteMutation,
    updateProfileMutation,
    updatePasswordMutation,
    updateRoleMutation,
  };
};
