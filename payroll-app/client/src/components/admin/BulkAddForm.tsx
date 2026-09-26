import { useState, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { generateSlots } from './patternUtils';
import type { GeneratedSlot } from './patternUtils';

interface Props {
  patternId: number;
  onCreateBulkSlots: (data: { pattern_id: number; slots: GeneratedSlot[] }) => void;
}

interface BulkConfig {
  startTime: string;
  periodCount: number | string;
  classDuration: number | string;
  breakDuration: number | string;
  [key: string]: string | number;
}

export default function BulkAddForm({ patternId, onCreateBulkSlots }: Props) {
  const [config, setConfig] = useState<BulkConfig>({
    startTime: '17:00',
    periodCount: 5,
    classDuration: 80,
    breakDuration: 10,
  });

  const parseConfigNumber = (value: string | number, fallback: number): number => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const preview = useMemo(() => {
    const periodCount = parseConfigNumber(config.periodCount, 1);
    const classDuration = parseConfigNumber(config.classDuration, 80);
    const breakDuration = parseConfigNumber(config.breakDuration, 0);
    return generateSlots(config.startTime, periodCount, classDuration, breakDuration);
  }, [config.startTime, config.periodCount, config.classDuration, config.breakDuration]);

  const setNumericField = (
    field: string,
    rawValue: string,
    { min, max, fallback }: { min?: number; max?: number; fallback: number },
  ) => {
    if (rawValue === '') {
      setConfig((prev) => ({ ...prev, [field]: '' }));
      return;
    }

    let next = parseConfigNumber(rawValue, fallback);
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    setConfig((prev) => ({ ...prev, [field]: next }));
  };

  const normalizeNumericField = (
    field: string,
    { min, max, fallback }: { min?: number; max?: number; fallback: number },
  ) => {
    let next = parseConfigNumber(config[field], fallback);
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    setConfig((prev) => ({ ...prev, [field]: next }));
  };

  const handleSubmit = () => {
    if (preview.length === 0) return;
    onCreateBulkSlots({
      pattern_id: patternId,
      slots: preview,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500 font-bold">開始時刻</span>
          <input
            type="time"
            value={config.startTime}
            onChange={(e) => setConfig({ ...config, startTime: e.target.value })}
            className="w-full p-2 text-sm border rounded-lg font-mono mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500 font-bold">コマ数</span>
          <input
            type="number"
            min={1}
            max={20}
            value={config.periodCount ?? ''}
            onChange={(e) =>
              setNumericField('periodCount', e.target.value, { min: 1, max: 20, fallback: 1 })
            }
            onBlur={() => normalizeNumericField('periodCount', { min: 1, max: 20, fallback: 1 })}
            className="w-full p-2 text-sm border rounded-lg font-mono mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500 font-bold">授業時間(分)</span>
          <input
            type="number"
            min={10}
            max={180}
            step={5}
            value={config.classDuration ?? ''}
            onChange={(e) =>
              setNumericField('classDuration', e.target.value, { min: 10, max: 180, fallback: 80 })
            }
            onBlur={() =>
              normalizeNumericField('classDuration', { min: 10, max: 180, fallback: 80 })
            }
            className="w-full p-2 text-sm border rounded-lg font-mono mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500 font-bold">休憩時間(分)</span>
          <input
            type="number"
            min={0}
            max={60}
            step={5}
            value={config.breakDuration ?? ''}
            onChange={(e) =>
              setNumericField('breakDuration', e.target.value, { min: 0, max: 60, fallback: 0 })
            }
            onBlur={() => normalizeNumericField('breakDuration', { min: 0, max: 60, fallback: 0 })}
            className="w-full p-2 text-sm border rounded-lg font-mono mt-1"
          />
        </label>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 mb-2">プレビュー ({preview.length}コマ)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
          {preview.map((slot, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm"
            >
              <span className="font-bold text-purple-600 w-10">{slot.period_name}</span>
              <span className="font-mono text-gray-600">
                {slot.start_time} ~ {slot.end_time}
              </span>
              <span className="text-xs text-gray-400 ml-auto">{config.classDuration}分</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-bold hover:bg-purple-700 shadow-sm btn-interactive flex items-center justify-center gap-2"
      >
        <Zap size={16} />
        {preview.length}コマを一括追加
      </button>
    </div>
  );
}
