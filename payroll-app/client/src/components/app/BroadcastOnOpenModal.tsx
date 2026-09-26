import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../../api/chat';
import { useBroadcasts } from '../../hooks/useBroadcasts';
import BroadcastDetailModal from '../broadcast/BroadcastDetailModal';
import type { Broadcast } from '../../types';

/**
 * On first Layout mount per session, surface any broadcasts that the admin
 * flagged with `show_on_open` and that the current user has not read yet.
 * The queue is captured once at mount so that broadcasts arriving mid-session
 * don't suddenly pop up on top of whatever the user is doing.
 */
export default function BroadcastOnOpenModal() {
  const queryClient = useQueryClient();
  const { data: broadcasts, isSuccess } = useBroadcasts();
  const [queue, setQueue] = useState<number[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const broadcastList = useMemo<Broadcast[]>(() => broadcasts ?? [], [broadcasts]);

  // Snapshot the unread show_on_open broadcasts once, the first time the query
  // resolves. Setting state during render (the React-blessed alternative to
  // setState-in-useEffect) — guarded by `queue === null` so it runs exactly once.
  // Expiry is filtered server-side for non-admin users, so we skip it here to
  // avoid an impure `Date.now()` call during render.
  if (queue === null && isSuccess) {
    setQueue(broadcastList.filter((b) => b.show_on_open && !b.is_read).map((b) => b.id));
  }

  const markReadMutation = useMutation({
    mutationFn: (broadcastId: number) => chatApi.markBroadcastRead(broadcastId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
    },
  });

  if (!queue || queue.length === 0 || currentIndex >= queue.length) return null;

  const currentId = queue[currentIndex];
  const current = broadcastList.find((b) => b.id === currentId);
  if (!current) {
    setCurrentIndex((i) => i + 1);
    return null;
  }

  const remaining = queue.length - currentIndex - 1;

  const handleClose = () => {
    markReadMutation.mutate(currentId);
    setCurrentIndex((i) => i + 1);
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <BroadcastDetailModal broadcast={current} onClose={handleClose} />
      {remaining > 0 && (
        <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 -translate-x-1/2 z-[71]">
          {/* 常時ダークのバッジ。bg-gray-900 はダークモードで反転するため slate で固定 */}
          <span className="bg-slate-900/80 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
            あと {remaining} 件
          </span>
        </div>
      )}
    </div>
  );
}
