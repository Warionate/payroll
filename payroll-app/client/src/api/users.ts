import { apiClient, getResponse } from './client';

export const fetchUsers = () => apiClient.get('/users').then(getResponse);

export const deleteUser = (id: number, password?: string) =>
  apiClient.delete(`/users/${id}`, password ? { data: { password } } : undefined).then(getResponse);

export const updateUserProfile = (id: number, username: string) =>
  apiClient.put(`/users/${id}/profile`, { username }).then(getResponse);

export const updateUserPassword = (id: number, password: string, currentPassword?: string) =>
  apiClient.put(`/users/${id}/password`, { password, currentPassword }).then(getResponse);

export const updateUserRole = (id: number, role: string) =>
  apiClient.put(`/users/${id}/role`, { role }).then(getResponse);
