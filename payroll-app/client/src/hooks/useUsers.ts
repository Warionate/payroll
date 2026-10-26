import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsers,
  deleteUser,
  updateUserProfile,
  updateUserLoginId,
  resetUserMfa,
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
    mutationFn: ({ id, displayName }: { id: number; displayName: string }) =>
      updateUserProfile(id, displayName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const resetMfaMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => resetUserMfa(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const updateLoginIdMutation = useMutation({
    mutationFn: ({ id, username }: { id: number; username: string }) =>
      updateUserLoginId(id, username),
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
    updateLoginIdMutation,
    resetMfaMutation,
    updatePasswordMutation,
    updateRoleMutation,
  };
};
