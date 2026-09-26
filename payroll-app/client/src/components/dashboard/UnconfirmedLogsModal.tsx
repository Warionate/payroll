import { useState } from 'react';
import { X, AlertTriangle, CheckCheck, Check, Pencil, BookOpen, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import LoadingButton from '../common/LoadingButton';
import type { WorkLog } from '../../types';

/** API の JOIN で付くスロット情報込みの勤務ログ */
export type UnconfirmedLog = WorkLog & {
  period_name?: string;
  start_time?: string;
  end_time?: string;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  logs: UnconfirmedLog[];
  /** 1 件を「完了」にする。成功で resolve */
  onConfirmOne: (id: number) => Promise<void>;
  /** 表示中の全件を「完了」にする（確認ダイアログは呼び出し側で出す） */
  onConfirmAll: () => Promise<void>;
  /** 「修正」: モーダルを閉じてその日の入力モーダルを開く */
  onEdit: (date: string) => void;
  isCompletingAll: boolean;
}

const describeLog = (log: UnconfirmedLog): { icon: typeof BookOpen; label: string } => {
  if (log.work_type === 'class') {
    const period = log.period_name || '授業';
    const students = log.student_count ? ` ・ ${log.student_count}名` : '';
    const time = log.start_time ? ` ${log.start_time}〜${log.end_time ?? ''}` : '';
    return { icon: BookOpen, label: `${period}${time}${students}` };
  }
  const m = Number(log.duration_minutes) || 0;
  return {
    icon: Clock,
    label: `規定外 ${Math.floor(m / 60)}時間${m % 60 > 0 ? `${m % 60}分` : ''}`,
  };
};

export default function UnconfirmedLogsModal({
  isOpen,
  onClose,
  logs,
  onConfirmOne,
  onConfirmAll,
  onEdit,
  isCompletingAll,
}: Props) {
  const { modalRef } = useModalAccessibility({ isOpen, onClose });
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleConfirmOne = async (id: number) => {
    setConfirmingId(id);
    try {
      await onConfirmOne(id);
    } finally {
      setConfirmingId(null);
    }
  };

  // 日付ごとにグループ化（新しい日付が上）
  const byDate = new Map<string, UnconfirmedLog[]>();
  for (const log of [...logs].sort((a, b) => b.date.localeCompare(a.date))) {
    const list = byDate.get(log.date) ?? [];
    list.push(log);
    byDate.set(log.date, list);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unconfirmed-modal-title"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="bg-white w-full sm:max-w-lg rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden animate-slide-up sm:animate-fade-in flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b shrink-0">
          <h3
            className="font-bold text-gray-700 text-lg flex items-center gap-2"
            id="unconfirmed-modal-title"
          >
            <AlertTriangle size={18} className="text-red-500" />
            未確定の報告 ({logs.length}件)
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full"
            aria-label="閉じる"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-4 space-y-4 min-h-0">
          {logs.length === 0 && (
            <p className="text-center text-gray-400 py-8">未確定の報告はありません</p>
          )}
          {[...byDate.entries()].map(([date, dayLogs]) => (
            <div key={date}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-600">
                  {format(parseISO(date), 'M月d日 (E)', { locale: ja })}
                </p>
                <button
                  onClick={() => onEdit(date)}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Pencil size={12} />
                  修正
                </button>
              </div>
              <div className="space-y-2">
                {dayLogs.map((log) => {
                  const { icon: Icon, label } = describeLog(log);
                  return (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <Icon size={16} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{label}</p>
                        {log.note && <p className="text-xs text-gray-400 truncate">{log.note}</p>}
                      </div>
                      <button
                        onClick={() => handleConfirmOne(log.id)}
                        disabled={confirmingId !== null || isCompletingAll}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Check size={14} />
                        {confirmingId === log.id ? '確定中...' : '確定'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))] shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
          >
            閉じる
          </button>
          {logs.length > 0 && (
            <LoadingButton
              onClick={onConfirmAll}
              loading={isCompletingAll}
              className="flex-1"
              loadingText="確定中..."
            >
              <span className="flex items-center justify-center gap-1">
                <CheckCheck size={16} />
                すべて確定
              </span>
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  );
}
