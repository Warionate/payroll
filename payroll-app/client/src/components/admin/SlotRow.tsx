import { useState } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { addMinutes } from './patternUtils';
import type { ScheduleSlot } from '../../types';

interface Props {
  slot: ScheduleSlot;
  onUpdateSlot: (
    id: number,
    data: { period_name: string; start_time: string; end_time: string },
  ) => void;
  onDeleteSlot: (id: number) => void;
}

export default function SlotRow({ slot, onUpdateSlot, onDeleteSlot }: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    period_name: slot.period_name,
    start_time: slot.start_time,
    end_time: slot.end_time,
  });

  const startEdit = () => {
    setEditData({
      period_name: slot.period_name,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleStartTimeChange = (newStartTime: string) => {
    setEditData({
      ...editData,
      start_time: newStartTime,
      end_time: addMinutes(newStartTime, 80),
    });
  };

  const saveEdit = () => {
    if (!editData.period_name || !editData.start_time || !editData.end_time) {
      return toast.error('項目を入力してください');
    }
    onUpdateSlot(slot.id, editData);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-purple-50 p-3 rounded-lg text-sm border border-purple-200">
        <input
          type="text"
          value={editData.period_name}
          onChange={(e) => setEditData({ ...editData, period_name: e.target.value })}
          className="w-20 p-1.5 text-xs border rounded font-bold"
        />
        <input
          type="time"
          value={editData.start_time}
          onChange={(e) => handleStartTimeChange(e.target.value)}
          className="p-1.5 text-xs border rounded font-mono"
        />
        <span className="text-gray-400">~</span>
        <input
          type="time"
          value={editData.end_time}
          onChange={(e) => setEditData({ ...editData, end_time: e.target.value })}
          className="p-1.5 text-xs border rounded font-mono"
        />
        <div className="ml-auto flex gap-1">
          <button
            onClick={saveEdit}
            className="text-green-600 hover:text-green-700 hover:bg-green-50 rounded p-1.5 transition-colors btn-interactive"
            title="保存"
          >
            <Check size={16} />
          </button>
          <button
            onClick={cancelEdit}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded p-1.5 transition-colors btn-interactive"
            title="キャンセル"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg text-sm border border-gray-100 group">
      <div className="flex items-center gap-4">
        <span className="font-bold text-gray-700 w-16">{slot.period_name}</span>
        <span className="font-mono text-gray-500">
          {slot.start_time} ~ {slot.end_time}
        </span>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={startEdit}
          className="text-gray-300 hover:text-purple-500 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center"
          title="編集"
          aria-label={`${slot.period_name}を編集`}
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => onDeleteSlot(slot.id)}
          className="text-gray-300 hover:text-red-400 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center"
          title="削除"
          aria-label={`${slot.period_name}を削除`}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
