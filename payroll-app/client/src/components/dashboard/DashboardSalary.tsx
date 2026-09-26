import React, { useState } from 'react';
import { Wallet, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useSwipe } from '../../hooks/useSwipe';

interface DashboardSalaryProps {
  salaryData: { confirmed: number; estimated: number; periodText: string };
  targetDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export default function DashboardSalary({
  salaryData,
  targetDate,
  onPrevMonth,
  onNextMonth,
}: DashboardSalaryProps) {
  const salarySwipeHandlers = useSwipe({
    onSwipeLeft: onNextMonth,
    onSwipeRight: onPrevMonth,
  });

  const [isSalaryScrolling, setIsSalaryScrolling] = useState(false);
  const handleSalaryWheel = (e: React.WheelEvent) => {
    if (isSalaryScrolling) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      if (Math.abs(e.deltaX) < 20) return;
      setIsSalaryScrolling(true);
      if (e.deltaX > 0) onNextMonth();
      else onPrevMonth();
    } else {
      if (Math.abs(e.deltaY) < 20) return;
      setIsSalaryScrolling(true);
      if (e.deltaY > 0) onNextMonth();
      else onPrevMonth();
    }
    setTimeout(() => setIsSalaryScrolling(false), 500);
  };

  return (
    <div className="space-y-3 touch-pan-y" {...salarySwipeHandlers} onWheel={handleSalaryWheel}>
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Wallet className="text-blue-600" />
          給与見込
        </h2>
        <div className="flex items-center bg-white rounded-full shadow-sm border px-1">
          <button
            onClick={onPrevMonth}
            className="p-2 hover:bg-gray-100 rounded-full"
            aria-label="前の月"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold px-2">{format(targetDate, 'yyyy年M月支給')}</span>
          <button
            onClick={onNextMonth}
            className="p-2 hover:bg-gray-100 rounded-full"
            aria-label="次の月"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        {/* Confirmed Card */}
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <CheckCircle size={48} />
          </div>
          <p className="text-green-100 text-xs font-bold mb-1">確定給与</p>
          <h3 className="text-2xl md:text-3xl font-bold">
            ¥{salaryData.confirmed.toLocaleString()}
          </h3>
          <p className="text-[10px] text-green-100 mt-2 opacity-80">完了済みの授業・規定外</p>
        </div>

        {/* Estimated Card */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <Wallet size={48} />
          </div>
          <p className="text-blue-100 text-xs font-bold mb-1">支給見込 (全予定)</p>
          <h3 className="text-2xl md:text-3xl font-bold">
            ¥{salaryData.estimated.toLocaleString()}
          </h3>
          <p className="text-[10px] text-blue-100 mt-2 opacity-80">期間: {salaryData.periodText}</p>
        </div>
      </div>
    </div>
  );
}
