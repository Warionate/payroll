import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../api/chat';

const BROADCASTS_REFETCH_INTERVAL = 30000;

/**
 * Hook for fetching broadcasts (announcements).
 * Used by Dashboard and other components that need broadcast data.
 * WebSocket was removed (G章); freshness now comes from polling + Web Push.
 */
export const useBroadcasts = () => {
  return useQuery({
    queryKey: ['broadcasts'],
    queryFn: async () => {
      const res = await chatApi.fetchBroadcasts();
      return res.data;
    },
    refetchInterval: BROADCASTS_REFETCH_INTERVAL,
  });
};

const UNREAD_REFETCH_INTERVAL = 60000;

/**
 * Number of unread broadcasts (announcements) for the current user.
 * Drives the announcement bell badge in the header. Cache key `['unreadCount']`
 * is invalidated by the read flow (BroadcastOnOpenModal / BroadcastList).
 *
 * Polls on a fixed interval regardless of socket state: broadcast socket events
 * only invalidate `['broadcasts']`, not the unread count, so this must refetch
 * on its own to keep the badge fresh (and it stays correct once sockets are
 * removed entirely).
 */
export const useUnreadBroadcastCount = () => {
  return useQuery({
    queryKey: ['unreadCount'],
    queryFn: () => chatApi.fetchUnread(),
    select: (data) => data.broadcasts,
    refetchInterval: UNREAD_REFETCH_INTERVAL,
  });
};

export default useBroadcasts;
