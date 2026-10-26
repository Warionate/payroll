import { apiClient, getResponse } from './client';

export const fetchUsers = () => apiClient.get('/users').then(getResponse);

export const deleteUser = (id: number, password?: string) =>
  apiClient.delete(`/users/${id}`, password ? { data: { password } } : undefined).then(getResponse);

/** 表示名を変える */
export const updateUserProfile = (id: number, displayName: string) =>
  apiClient.put(`/users/${id}/profile`, { display_name: displayName }).then(getResponse);

/** ユーザー ID（ログインに使う）を変える */
export const updateUserLoginId = (id: number, username: string) =>
  apiClient.put(`/users/${id}/login-id`, { username }).then(getResponse);

export const updateUserPassword = (id: number, password: string, currentPassword?: string) =>
  apiClient.put(`/users/${id}/password`, { password, currentPassword }).then(getResponse);

/** 二段階認証のリセット（管理者だけ） */
export const resetUserMfa = (id: number) =>
  apiClient.post(`/users/${id}/mfa/reset`).then(getResponse);

export const updateUserRole = (id: number, role: string) =>
  apiClient.put(`/users/${id}/role`, { role }).then(getResponse);
