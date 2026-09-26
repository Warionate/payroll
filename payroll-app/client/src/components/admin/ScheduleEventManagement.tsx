import { useState } from 'react';
import { CalendarDays, Edit2, Trash2, Plus, X } from 'lucide-react';
import SkeletonRow from '../loading/SkeletonRow';
import { SCHEDULE_EVENT_TYPES, getScheduleEventStyle } from '../dashboard/scheduleEventStyle';
import type { ScheduleEvent, CreateScheduleEventInput, ScheduleEventType } from '../../types';

type FormState = {
  title: string;
  description: string;
  event_type: ScheduleEventType;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  event_type: 'other',
  start_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
};

interface Props {
  events: ScheduleEvent[];
  isLoading: boolean;
  onCreate: (data: CreateScheduleEventInput) => Promise<void>;
  onUpdate: (id: number, data: CreateScheduleEventInput) => Promise<void>;
  onDelete: (id: number) => void;
}

function toFormState(event: ScheduleEvent): FormState {
  return {
    title: event.title,
    description: event.description ?? '',
    event_type: event.event_type ?? 'other',
    start_date: event.start_date,
    end_date: event.end_date,
    start_time: event.start_time ?? '',
    end_time: event.end_time ?? '',
  };
}

function toInput(form: FormState): CreateScheduleEventInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    event_type: form.event_type,
    start_date: form.start_date,
    end_date: form.end_date,
    start_time: form.start_time || null,
    end_time: form.end_time || null,
  };
}

export default function ScheduleEventManagement({
  events,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.start_date || !form.end_date) return;
    if (form.end_date < form.start_date) return;

    try {
      setSubmitting(true);
      const input = toInput(form);
      if (editingId != null) {
        await onUpdate(editingId, input);
      } else {
        await onCreate(input);
      }
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (event: ScheduleEvent) => {
    setEditingId(event.id);
    setForm(toFormState(event));
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.end_date >= todayStr);
  const past = events.filter((e) => e.end_date < todayStr);

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-700">
        <CalendarDays size={20} className="text-purple-600" />
        塾内予定管理（講師フォーラム・休講など）
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        登録した予定は<span className="font-bold">全ユーザー</span>のカレンダーと
        ダッシュボードに表示されます。
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-6 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2">
            {editingId != null ? (
              <>
                <Edit2 size={14} /> 予定を編集
              </>
            ) : (
              <>
                <Plus size={14} /> 新規予定
              </>
            )}
          </h3>
          {editingId != null && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X size={12} /> キャンセル
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">種別</label>
          <div className="flex gap-2 flex-wrap">
            {SCHEDULE_EVENT_TYPES.map((type) => {
              const style = getScheduleEventStyle(type);
              const isActive = form.event_type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('event_type', type)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors ${
                    isActive
                      ? style.badge + ' ring-2 ring-offset-1 ring-gray-300'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {style.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">タイトル</label>
          <input
            type="text"
            className="w-full p-2 border rounded-lg"
            maxLength={100}
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="例: 講師フォーラム / 休講 / 研修"
            required
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">開始日</label>
            <input
              type="date"
              className="w-full p-2 border rounded-lg"
              value={form.start_date}
              onChange={(e) => {
                const v = e.target.value;
                update('start_date', v);
                if (!form.end_date || form.end_date < v) update('end_date', v);
              }}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">終了日</label>
            <input
              type="date"
              className="w-full p-2 border rounded-lg"
              min={form.start_date || undefined}
              value={form.end_date}
              onChange={(e) => update('end_date', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">開始時刻（任意）</label>
            <input
              type="time"
              className="w-full p-2 border rounded-lg"
              value={form.start_time}
              onChange={(e) => update('start_time', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">終了時刻（任意）</label>
            <input
              type="time"
              className="w-full p-2 border rounded-lg"
              value={form.end_time}
              onChange={(e) => update('end_time', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">詳細（任意）</label>
          <textarea
            className="w-full p-2 border rounded-lg text-sm"
            rows={2}
            maxLength={1000}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="補足情報があれば記載"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="bg-purple-500 text-white py-2 px-6 rounded-lg font-bold hover:bg-purple-600 shadow-sm btn-interactive disabled:opacity-50"
          >
            {editingId != null ? '更新' : '登録'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <EventList
          title="今後の予定"
          events={upcoming}
          isLoading={isLoading}
          onEdit={startEdit}
          onDelete={onDelete}
        />
        {past.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-700">
              過去の予定 ({past.length}件)
            </summary>
            <div className="mt-2">
              <EventList
                title=""
                events={past}
                isLoading={false}
                onEdit={startEdit}
                onDelete={onDelete}
              />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function EventList({
  title,
  events,
  isLoading,
  onEdit,
  onDelete,
}: {
  title: string;
  events: ScheduleEvent[];
  isLoading: boolean;
  onEdit: (event: ScheduleEvent) => void;
  onDelete: (id: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="py-2">
        <SkeletonRow count={3} height="h-12" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <>
        {title && <h3 className="text-sm font-bold text-gray-600 mb-2">{title}</h3>}
        <p className="text-center text-sm text-gray-400 py-4">登録された予定はありません</p>
      </>
    );
  }

  return (
    <>
      {title && <h3 className="text-sm font-bold text-gray-600 mb-2">{title}</h3>}
      <div className="space-y-2">
        {events.map((event) => {
          const typeStyle = getScheduleEventStyle(event.event_type);
          return (
            <div
              key={event.id}
              className="flex items-start justify-between bg-gray-50 p-3 rounded-lg border border-gray-200 gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-bold flex-shrink-0 ${typeStyle.badge}`}
                  >
                    {typeStyle.label}
                  </span>
                  <span className="font-bold text-gray-800 break-words">{event.title}</span>
                </div>
                <div className="text-xs text-gray-600 font-mono">
                  {event.start_date === event.end_date
                    ? event.start_date
                    : `${event.start_date} 〜 ${event.end_date}`}
                  {event.start_time && (
                    <span className="ml-2">
                      {event.start_time}
                      {event.end_time ? ` 〜 ${event.end_time}` : ''}
                    </span>
                  )}
                </div>
                {event.description && (
                  <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap break-words">
                    {event.description}
                  </p>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(event)}
                  className="text-gray-400 hover:text-blue-600 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center"
                  aria-label="編集"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => onDelete(event.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center"
                  aria-label="削除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
