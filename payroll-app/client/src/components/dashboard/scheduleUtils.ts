import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export const getDayOfWeekColor = (day: Date) => {
  const dayOfWeek = format(day, 'E', { locale: ja });
  if (dayOfWeek === '日') return 'text-red-400';
  if (dayOfWeek === '土') return 'text-blue-400';
  return 'text-gray-400';
};
