import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { addMinutes } from './patternUtils';

interface Props {
  patternId: number;
  onCreateSlot: (data: {
    period_name: string;
    start_time: string;
    end_time: string;
    pattern_id: number;
  }) => void;
}

export default function SingleSlotForm({ patternId, onCreateSlot }: Props) {
  const [data, setData] = useState({
    period_name: '',
    start_time: '17:00',
    end_time: '18:20',
  });

  const handleStartTimeChange = (newStartTime: string) => {
    setData({
      ...data,
      start_time: newStartTime,
      end_time: addMinutes(newStartTime, 80),
    });
  };

  const handleSubmit = () => {
    if (!data.period_name || !data.start_time || !data.end_time) {
      return toast.error('項目を入力してください');
    }
    onCreateSlot({ ...data, pattern_id: patternId });
    setData({ period_name: '', start_time: '17:00', end_time: '18:20' });
  };

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <label className="block">
        <span className="text-xs text-gray-500">時限名</span>
        <input
          type="text"
          placeholder="例: 1限"
          className="w-24 p-2 text-xs border rounded font-bold mt-0.5"
          value={data.period_name}
          onChange={(e) => setData({ ...data, period_name: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500">開始</span>
        <input
          type="time"
          className="p-2 text-xs border rounded font-mono mt-0.5"
          value={data.start_time}
          onChange={(e) => handleStartTimeChange(e.target.value)}
        />
      </label>
      <span className="text-gray-400 pb-2">~</span>
      <label className="block">
        <span className="text-xs text-gray-500">終了</span>
        <input
          type="time"
          className="p-2 text-xs border rounded font-mono mt-0.5"
          value={data.end_time}
          onChange={(e) => setData({ ...data, end_time: e.target.value })}
        />
      </label>
      <button
        type="button"
        onClick={handleSubmit}
        className="ml-auto bg-purple-500 text-white text-xs px-4 py-2 rounded-lg font-bold hover:bg-purple-600 shadow-sm btn-interactive"
      >
        追加
      </button>
    </div>
  );
}
