import { useState, memo } from 'react';
import { Clock, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface HourlyLog {
  id: number;
  work_type: string;
  duration_minutes?: number;
  note?: string;
  status?: string;
}

interface Props {
  hourlyLogs: HourlyLog[];
  pendingHourlyStatus: Record<number, string>;
  onHourlyStatusToggle: (log: HourlyLog) => void;
  onHourlyEdit?: (log: HourlyLog) => void;
  onDelete: (id: number) => void;
  date: Date;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onUpdateLog: (id: number, data: Record<string, unknown>) => Promise<void>;
}

const HourlyWorkSection = memo(
  ({
    hourlyLogs,
    pendingHourlyStatus,
    onHourlyStatusToggle,
    onHourlyEdit,
    onDelete,
    date,
    onSave,
    onUpdateLog,
  }: Props) => {
    const [showHourlyForm, setShowHourlyForm] = useState(false);
    const [editingHourlyId, setEditingHourlyId] = useState<number | null>(null);
    const [hourlyMinutes, setHourlyMinutes] = useState('60');
    const [hourlyNote, setHourlyNote] = useState('');

    const handleEditClick = (log: HourlyLog) => {
      setEditingHourlyId(log.id);
      setHourlyMinutes((log.duration_minutes ?? '').toString());
      setHourlyNote(log.note || '');
      setShowHourlyForm(true);
      if (onHourlyEdit) onHourlyEdit(log); // Optional parent callback if needed
    };

    const handleSave = async () => {
      const parsedMinutes = hourlyMinutes === '' ? 0 : Number(hourlyMinutes);
      const data = {
        work_type: 'hourly',
        date: format(date, 'yyyy-MM-dd'),
        duration_minutes: Number.isNaN(parsedMinutes) ? 0 : parsedMinutes,
        note: hourlyNote,
        schedule_slot_id: null,
        student_count: null,
        status: 'planned',
      };

      if (editingHourlyId) {
        // Find existing status to preserve it
        // This logic might need to be passed up or handled if we don't have all logs here
        // But we do have hourlyLogs prop.
        const existing = hourlyLogs.find((l) => l.id === editingHourlyId);
        if (existing) data.status = existing.status ?? 'planned';
        await onUpdateLog(editingHourlyId, data);
      } else {
        await onSave(data);
      }
      resetForm();
    };

    const resetForm = () => {
      setShowHourlyForm(false);
      setEditingHourlyId(null);
      setHourlyMinutes('60');
      setHourlyNote('');
    };

    return (
      <section>
        <h4 className="font-bold text-gray-500 text-xs mb-2 flex items-center gap-1">
          <Clock size={14} /> 規定外 (事務・研修など)
        </h4>

        <div className="space-y-2 mb-2">
          {hourlyLogs.map((log) => {
            const currentStatus = pendingHourlyStatus[log.id] || log.status;
            const isCompleted = currentStatus === 'completed';

            return (
              <div
                key={log.id}
                className={`flex justify-between items-center p-2 rounded border text-sm ${isCompleted ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}
              >
                <div>
                  <span className="font-bold text-gray-700 mr-2">{log.duration_minutes}分</span>
                  <span className="text-gray-500 text-xs">{log.note}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onHourlyStatusToggle(log)}
                    className={`p-1 rounded ${isCompleted ? 'text-green-600 bg-green-100' : 'text-gray-400 hover:text-green-500'}`}
                    title={isCompleted ? '未完了に戻す' : '完了にする'}
                  >
                    <CheckCircle size={14} />
                  </button>
                  <button
                    onClick={() => handleEditClick(log)}
                    className="p-1 text-blue-400 hover:bg-blue-100 rounded"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(log.id)}
                    className="p-1 text-red-400 hover:bg-red-100 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!showHourlyForm ? (
          <button
            onClick={() => setShowHourlyForm(true)}
            className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 rounded-lg text-sm font-bold hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            + 規定外を追加
          </button>
        ) : (
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 animate-fade-in">
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                min={0}
                step={1}
                value={hourlyMinutes}
                onChange={(e) => setHourlyMinutes(e.target.value)}
                className="w-20 p-1 text-sm border rounded text-center font-bold"
              />
              <div className="flex gap-1 flex-1">
                {[30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    onClick={() => setHourlyMinutes(String(m))}
                    className="flex-1 bg-white border rounded text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              placeholder="備考 (任意)"
              value={hourlyNote}
              onChange={(e) => setHourlyNote(e.target.value)}
              className="w-full p-1 text-sm border rounded mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={resetForm}
                className="flex-1 py-1 bg-white border text-gray-500 text-xs font-bold rounded"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-1 bg-orange-500 text-white text-xs font-bold rounded shadow"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </section>
    );
  },
);

HourlyWorkSection.displayName = 'HourlyWorkSection';
export default HourlyWorkSection;
