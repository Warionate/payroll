import { apiClient } from './client';

export const notificationsApi = {
  getVapidPublicKey: () => apiClient.get('/notifications/vapid-public-key').then((r) => r.data),

  subscribe: (subscription: PushSubscriptionJSON) =>
    apiClient.post('/notifications/subscribe', subscription).then((r) => r.data),

  unsubscribe: (endpoint: string) =>
    apiClient.post('/notifications/unsubscribe', { endpoint }).then((r) => r.data),
};
