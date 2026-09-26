import { TrendingUp, Calendar } from 'lucide-react';

interface YearlySummary {
  total: number;
  classTotal: number;
  hourlyTotal: number;
  allowanceTotal: number;
  adjustmentTotal: number;
  monthCount: number;
}

interface Props {
  selectedYear: number;
  summary: YearlySummary;
}

export default function SalaryYearlySummary({ selectedYear, summary }: Props) {
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg p-4 mb-4 text-white">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp size={20} />
        <span className="font-bold">{selectedYear}年 年間サマリー</span>
      </div>
      <div className="text-3xl font-bold mb-3">¥{summary.total.toLocaleString()}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-white/20 rounded-lg p-2">
          <div className="opacity-80">授業給</div>
          <div className="font-bold">¥{summary.classTotal.toLocaleString()}</div>
        </div>
        <div className="bg-white/20 rounded-lg p-2">
          <div className="opacity-80">規定外</div>
          <div className="font-bold">¥{summary.hourlyTotal.toLocaleString()}</div>
        </div>
        <div className="bg-white/20 rounded-lg p-2">
          <div className="opacity-80">手当</div>
          <div className="font-bold">¥{summary.allowanceTotal.toLocaleString()}</div>
        </div>
        <div className="bg-white/20 rounded-lg p-2">
          <div className="opacity-80">調整</div>
          <div className={`font-bold ${summary.adjustmentTotal >= 0 ? '' : 'text-red-200'}`}>
            {summary.adjustmentTotal >= 0 ? '+' : ''}¥{summary.adjustmentTotal.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs opacity-70 flex items-center gap-1">
        <Calendar size={12} />
        {summary.monthCount}ヶ月分のデータ
      </div>
    </div>
  );
}
