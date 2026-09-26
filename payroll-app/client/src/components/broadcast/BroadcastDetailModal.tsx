import { X, Clock, AlertCircle, Wrench, Info, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { parseSQLDate } from '../../utils/dateUtils';
import MarkdownContent from '../common/MarkdownContent';
import AdminBadge from '../common/AdminBadge';
import type { Broadcast } from '../../types';

interface BroadcastDetailModalProps {
  broadcast: Broadcast | null;
  onClose: () => void;
}

export default function BroadcastDetailModal({ broadcast, onClose }: BroadcastDetailModalProps) {
  if (!broadcast) return null;

  const getCategoryIcon = (category: Broadcast['category']) => {
    switch (category) {
      case 'important':
        return <AlertCircle size={14} />;
      case 'maintenance':
        return <Wrench size={14} />;
      case 'event':
        return <CalendarIcon size={14} />;
      default:
        return <Info size={14} />;
    }
  };

  const getCategoryLabel = (category: Broadcast['category']) => {
    switch (category) {
      case 'important':
        return '重要';
      case 'maintenance':
        return 'メンテ';
      case 'event':
        return 'イベント';
      default:
        return 'お知らせ';
    }
  };

  const getCategoryColor = (category: Broadcast['category']) => {
    switch (category) {
      case 'important':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'maintenance':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'event':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center overlay-safe">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-full">
        <div className="p-4 border-b flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${getCategoryColor(broadcast.category)}`}
              >
                {getCategoryIcon(broadcast.category)}
                {getCategoryLabel(broadcast.category)}
              </div>
              {broadcast.expires_at && new Date(broadcast.expires_at) < new Date() && (
                <span className="text-xs bg-gray-500 text-white px-2 py-0.5 rounded-full font-bold">
                  期限切れ
                </span>
              )}
            </div>
            <h3 className="font-bold text-xl text-gray-800">{broadcast.title || 'お知らせ'}</h3>
            <div className="flex items-center gap-2 mt-1">
              {broadcast.updated_at && broadcast.updated_at !== broadcast.created_at && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                  編集済み
                </span>
              )}
              <p className="text-xs text-gray-400 inline-flex items-center gap-1">
                {format(
                  parseSQLDate(broadcast.updated_at || broadcast.created_at),
                  'yyyy/MM/dd HH:mm',
                )}
                <span>by</span>
                <span className="inline-flex items-center gap-0.5 font-bold text-gray-600">
                  {broadcast.sender_name || '削除済みユーザー'}
                  <AdminBadge size={12} />
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          <MarkdownContent content={broadcast.message} className="text-gray-700 leading-relaxed" />
          {broadcast.expires_at && (
            <div
              className={`mt-6 pt-4 border-t text-xs flex items-center gap-1 ${new Date(broadcast.expires_at) < new Date() ? 'text-gray-500' : 'text-red-500'}`}
            >
              <Clock size={14} />
              有効期限: {format(parseSQLDate(broadcast.expires_at), 'yyyy/MM/dd HH:mm')}まで
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
