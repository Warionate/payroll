// --- Utility: 時刻計算ヘルパー ---
export const addMinutes = (timeStr: string, minutes: number): string => {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

export interface GeneratedSlot {
  period_name: string;
  start_time: string;
  end_time: string;
}

// --- スロット生成ロジック ---
export const generateSlots = (
  startTime: string,
  periodCount: number,
  classDuration: number,
  breakDuration: number,
): GeneratedSlot[] => {
  const slots: GeneratedSlot[] = [];
  let currentTime: string = startTime;
  for (let i = 0; i < periodCount; i++) {
    const endTime = addMinutes(currentTime, classDuration);
    slots.push({
      period_name: `${i + 1}限`,
      start_time: currentTime,
      end_time: endTime,
    });
    currentTime = addMinutes(endTime, breakDuration);
  }
  return slots;
};
