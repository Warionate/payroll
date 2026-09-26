import { apiClient } from './client';

/**
 * Broadcast-only API. Server routes still live under `/chat/broadcasts/*`
 * because the original chat feature has been removed from the client but
 * the server-side schema/endpoints remain unchanged.
 */
export const chatApi = {
  fetchBroadcasts: () => apiClient.get('/chat/broadcasts').then((r) => r.data),

  /** Unread counts: { total, rooms, broadcasts }. Only `broadcasts` is used by the UI. */
  fetchUnread: () =>
    apiClient
      .get<{ total: number; rooms: number; broadcasts: number }>('/chat/unread')
      .then((r) => r.data),

  createBroadcast: (data: {
    title: string;
    message: string;
    expires_at?: string | null;
    category?: string;
    send_push?: boolean;
    show_on_open?: boolean;
  }) => apiClient.post('/chat/broadcasts', data).then((r) => r.data),

  deleteBroadcast: (id: number) => apiClient.delete(`/chat/broadcasts/${id}`).then((r) => r.data),

  markBroadcastRead: (broadcastId: number) =>
    apiClient.post(`/chat/broadcasts/${broadcastId}/read`).then((r) => r.data),
};
