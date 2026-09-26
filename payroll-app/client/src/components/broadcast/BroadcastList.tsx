import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Megaphone,
  Trash2,
  Clock,
  AlertCircle,
  Wrench,
  Info,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { chatApi } from '../../api/chat';
import { useBroadcasts } from '../../hooks/useBroadcasts';
import { useConfirm } from '../../hooks/useConfirm';
import { parseSQLDate } from '../../utils/dateUtils';
import EmptyState from '../common/EmptyState';
import BroadcastDetailModal from './BroadcastDetailModal';
import type { Broadcast, BroadcastCategory } from '../../types';

const getCategoryMeta = (category: BroadcastCategory) => {
  switch (category) {
    case 'important':
      return { icon: AlertCircle, label: '重要', color: 'bg-red-100 text-red-700 border-red-200' };
    case 'maintenance':
      return {
        icon: Wrench,
        label: 'メンテ',
        color: 'bg-orange-100 text-orange-700 border-orange-200',
      };
    case 'event':
      return {
        icon: CalendarIcon,
        label: 'イベント',
        color: 'bg-green-100 text-green-700 border-green-200',
      };
    default:
      return { icon: Info, label: 'お知らせ', color: 'bg-blue-100 text-blue-700 border-blue-200' };
  }
};

interface BroadcastListProps {
  /** Read-only view for general users: hides delete and marks read on open. */
  readOnly?: boolean;
  /** Auto-open this broadcast once it has loaded (push-notification deep link). */
  autoOpenId?: number | null;
}

export default function BroadcastList({ readOnly = false, autoOpenId = null }: BroadcastListProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: broadcasts = [], isLoading } = useBroadcasts();
  const [selected, setSelected] = useState<Broadcast | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => chatApi.deleteBroadcast(id),
    onSuccess: () => {
      toast.success('お知らせを削除しました');
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
    onError: (error: unknown) => {
      console.error('Failed to delete broadcast:', error);
      toast.error('削除に失敗しました');
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => chatApi.markBroadcastRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
    },
  });

  const openBroadcast = (broadcast: Broadcast) => {
    setSelected(broadcast);
    if (readOnly && !broadcast.is_read) markReadMutation.mutate(broadcast.id);
  };

  // Deep link from a push notification (/announcements?broadcastId=…): open the
  // target once it is present in the loaded list. Guarded so a background
  // refetch doesn't re-pop the modal after the user closes it.
  const handledAutoOpenId = useRef<number | null>(null);
  useEffect(() => {
    if (!readOnly || !autoOpenId || handledAutoOpenId.current === autoOpenId) return;
    const target = broadcasts.find((b: Broadcast) => b.id === autoOpenId);
    if (!target) return; // not loaded yet — retry when broadcasts arrive
    handledAutoOpenId.current = autoOpenId;
    // URL パラメータという外部ソースからの一度きりの反映なので effect 内の setState は意図的
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openBroadcast(target);
    // openBroadcast is stable enough for this one-shot effect; broadcasts drives re-eval
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, autoOpenId, broadcasts]);

  const handleDelete = async (e: React.MouseEvent, broadcast: Broadcast) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'お知らせ削除',
      message: `「${broadcast.title || 'お知らせ'}」を削除しますか？`,
      isDestructive: true,
    });
    if (ok) deleteMutation.mutate(broadcast.id);
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-1">
            <Megaphone className="text-blue-600" size={24} />
            お知らせ一覧
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {readOnly
              ? '運営からのお知らせを確認できます。'
              : '投稿済みのお知らせを確認・削除できます。'}
          </p>

          {isLoading ? (
            <p className="text-sm text-gray-500 py-4">読み込み中...</p>
          ) : broadcasts.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="お知らせはまだありません"
              description={
                readOnly ? '運営からのお知らせがここに表示されます' : '上のフォームから投稿できます'
              }
            />
          ) : (
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
              {broadcasts.map((b: Broadcast) => {
                const meta = getCategoryMeta(b.category);
                const Icon = meta.icon;
                const isExpired = b.expires_at && new Date(b.expires_at) < new Date();
                return (
                  <li
                    key={b.id}
                    onClick={() => openBroadcast(b)}
                    className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border shrink-0 ${meta.color}`}
                    >
                      <Icon size={12} />
                      {meta.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {readOnly && !b.is_read && (
                          <span
                            className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
                            aria-label="未読"
                            title="未読"
                          />
                        )}
                        <span className="font-bold text-gray-800 truncate">
                          {b.title || '(タイトルなし)'}
                        </span>
                        {isExpired && (
                          <span className="text-[10px] bg-gray-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                            期限切れ
                          </span>
                        )}
                        {b.show_on_open && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold border border-purple-200">
                            起動時表示
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{b.message}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                        <span>{format(parseSQLDate(b.created_at), 'yyyy/MM/dd HH:mm')}</span>
                        <span>by {b.sender_name || '削除済みユーザー'}</span>
                        {b.expires_at && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock size={10} />
                            {format(parseSQLDate(b.expires_at), 'yyyy/MM/dd HH:mm')}まで
                          </span>
                        )}
                        {typeof b.read_count === 'number' && typeof b.total_count === 'number' && (
                          <span>
                            既読 {b.read_count}/{b.total_count}
                          </span>
                        )}
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={(e) => handleDelete(e, b)}
                        disabled={deleteMutation.isPending}
                        className="text-gray-400 hover:text-red-600 p-1 rounded disabled:opacity-50"
                        aria-label="削除"
                        title="削除"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <BroadcastDetailModal broadcast={selected} onClose={() => setSelected(null)} />
    </>
  );
}
