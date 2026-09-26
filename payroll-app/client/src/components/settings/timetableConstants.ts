export const DAYS = ['月', '火', '水', '木', '金', '土'];
export const DAY_INDICES = [1, 2, 3, 4, 5, 6]; // 月=1 ~ 土=6
export const STUDENT_COUNTS = [1, 2, 3, 4];

// セルの色定義 (生徒数ごと)
export const CELL_COLORS: Record<
  number,
  { bg: string; border: string; text: string; hover: string }
> = {
  1: {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-blue-700',
    hover: 'hover:bg-blue-200',
  },
  2: {
    bg: 'bg-green-100',
    border: 'border-green-300',
    text: 'text-green-700',
    hover: 'hover:bg-green-200',
  },
  3: {
    bg: 'bg-orange-100',
    border: 'border-orange-300',
    text: 'text-orange-700',
    hover: 'hover:bg-orange-200',
  },
  4: {
    bg: 'bg-purple-100',
    border: 'border-purple-300',
    text: 'text-purple-700',
    hover: 'hover:bg-purple-200',
  },
};

export interface SlotInfo {
  id: number;
  period_name: string;
  start_time: string;
  end_time: string;
}
