import React from 'react';
import { AlertTriangle, Clock, BookOpen, ListChecks } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface NextSchedule {
  date: Date;
  startTime?: string;
  endTime?: string;
  classCount: number;
  hourlyCount: number;
}

interface DashboardAnnouncementsProps {
  unconfirmedCount: number;
  nextSchedule: NextSchedule | null;
  /** 未確定一覧モーダルを開く */
  onShowUnconfirmed?: () => void;
}

export default function DashboardAnnouncements({
  unconfirmedCount,
  nextSchedule,
  onShowUnconfirmed,
}: DashboardAnnouncementsProps) {
  return (
    <>
      {/* --- Unconfirmed Alert --- */}
      {unconfirmedCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-red-100 p-2 rounded-full text-red-500 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-red-700 font-bold text-sm">未確定の報告があります</p>
              <p className="text-red-500 text-xs">
                過去30日以内で {unconfirmedCount} 件の未完了項目があります。
              </p>
            </div>
          </div>
          {onShowUnconfirmed && (
            <button
              onClick={onShowUnconfirmed}
              className="shrink-0 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              <ListChecks size={14} />
              確認する
            </button>
          )}
        </div>
      )}

      {/* --- Next Work Day Summary --- */}
      {nextSchedule && (
        <div className="bg-gradient-to-r from-orange-500 to-pink-500 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <Clock size={64} />
          </div>
          <p className="text-orange-100 text-xs font-bold mb-1">次の出勤日</p>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-2xl font-bold">
              {format(nextSchedule.date, 'M/d')} ({format(nextSchedule.date, 'E', { locale: ja })})
            </h3>
            <span className="text-lg font-bold opacity-90">
              {nextSchedule.startTime} ~ {nextSchedule.endTime}
            </span>
          </div>
          <div className="flex gap-3">
            {nextSchedule.classCount > 0 && (
              <div className="bg-white/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <BookOpen size={16} />
                <span className="font-bold text-sm">授業 {nextSchedule.classCount}コマ</span>
              </div>
            )}
            {nextSchedule.hourlyCount > 0 && (
              <div className="bg-white/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <Clock size={16} />
                <span className="font-bold text-sm">規定外 {nextSchedule.hourlyCount}件</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
