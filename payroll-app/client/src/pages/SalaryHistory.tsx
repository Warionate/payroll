import { useState, useMemo } from 'react';
import SkeletonRow from '../components/loading/SkeletonRow';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  calculateSalary,
  SALARY_PERIOD_START_DAY,
  SALARY_PERIOD_END_DAY,
} from '../utils/salaryCalc';
import { Wallet, Search, SortAsc, SortDesc } from 'lucide-react';
import { useWorkLogs } from '../hooks/useWorkLogs';
import { useRates } from '../hooks/useRates';
import { useSalaryAdjustments, useSalaryAdjustmentMutation } from '../hooks/useSalaryAdjustments';
import { toast } from 'react-hot-toast';
import SalaryAdjustmentModal from '../components/salary/SalaryAdjustmentModal';
import SalaryYearlySummary from './salary/SalaryYearlySummary';
import SalaryHistoryCard from './salary/SalaryHistoryCard';
import { ADJUSTMENT_TYPE_INFO } from './salary/constants';
import type { HistoryItem, SalaryAdjustmentRecord, SalaryLogEntry } from './salary/constants';
import { pdfApi } from '../api/uploads';
import { useToday } from '../hooks/useToday';
import type { WorkLog, Rate } from '../types';

// Constants
const HISTORY_YEARS = 3;
const MONTHS_PER_YEAR = 12;
const EMPTY_LOGS: WorkLog[] = [];
const EMPTY_RATES: Rate[] = [];
const EMPTY_ADJUSTMENTS: SalaryAdjustmentRecord[] = [];

/**
 * CSV セルのエスケープ。
 * 全セルをダブルクォートで囲み（メモ等にカンマ・改行・引用符が含まれても
 * 列がずれない）、数式インジェクション対策として危険な先頭文字には
 * アポストロフィを付ける。数値はそのまま出力する。
 */
const csvCell = (value: string | number): string => {
  if (typeof value === 'number') return String(value);
  const sanitized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${sanitized.replace(/"/g, '""')}"`;
};

export default function SalaryHistory() {
  const today = useToday();

  // UI State
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [expandedAdjustments, setExpandedAdjustments] = useState<Record<string, boolean>>({});
  const [adjustmentModal, setAdjustmentModal] = useState<{
    isOpen: boolean;
    yearMonth: string | null;
    monthLabel: string | null;
    baseAmount: number;
    existing: SalaryAdjustmentRecord | null;
  }>({ isOpen: false, yearMonth: null, monthLabel: null, baseAmount: 0, existing: null });

  // Data fetching — 選択中の年の給与計算に必要な範囲だけ取得する。
  // 1月分の授業給は前年12/16開始・規定外給は前年12月分のため、
  // 前年12/1 をカバーすれば足りる。今年の場合は当月までで十分なので
  // fetchEnd を当月/15 に絞り、サーバーの日数上限（400日）を超えないようにする。
  const fetchEndMonth =
    selectedYear === today.getFullYear() ? today.getMonth() + 1 : MONTHS_PER_YEAR;
  const fetchStart = `${selectedYear - 1}-12-01`;
  const fetchEnd = `${selectedYear}-${String(fetchEndMonth).padStart(2, '0')}-${SALARY_PERIOD_END_DAY}`;
  const {
    data: logsData,
    isLoading: logsLoading,
    isPlaceholderData: logsPlaceholder,
  } = useWorkLogs(fetchStart, fetchEnd);
  const { data: ratesData, isLoading: ratesLoading } = useRates();
  const { data: adjustmentsData, isLoading: adjustmentsLoading } = useSalaryAdjustments();
  const logs = (logsData ?? EMPTY_LOGS) as WorkLog[];
  const rates = (ratesData ?? EMPTY_RATES) as Rate[];
  const adjustments = (adjustmentsData ?? EMPTY_ADJUSTMENTS) as SalaryAdjustmentRecord[];
  const { createMutation, updateMutation, deleteMutation } = useSalaryAdjustmentMutation();

  // Generate available years
  const availableYears = useMemo(() => {
    const years = [];
    for (let i = 0; i < HISTORY_YEARS; i++) {
      years.push(today.getFullYear() - i);
    }
    return years;
  }, [today]);

  // Calculate salary history (selectedYear の各月分)
  const history = useMemo(() => {
    if (logsLoading || ratesLoading || logsPlaceholder) return [];

    const currentRates = [...rates].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const historyData: HistoryItem[] = [];
    const maxMonth = selectedYear === today.getFullYear() ? today.getMonth() + 1 : MONTHS_PER_YEAR;

    for (let m = maxMonth; m >= 1; m--) {
      const iterDate = new Date(selectedYear, m - 1, 1);

      const classStart = new Date(selectedYear, m - 2, SALARY_PERIOD_START_DAY);
      const classEnd = new Date(selectedYear, m - 1, SALARY_PERIOD_END_DAY);

      const hourlyStart = startOfMonth(subMonths(iterDate, 1));
      const hourlyEnd = endOfMonth(subMonths(iterDate, 1));

      const result = calculateSalary(
        logs,
        currentRates,
        classStart,
        classEnd,
        hourlyStart,
        hourlyEnd,
      );
      const yearMonth = format(iterDate, 'yyyy-MM');

      const monthAdjustments = adjustments.filter((a) => a.year_month === yearMonth);
      const adjustmentTotal = monthAdjustments.reduce((sum, a) => sum + a.amount, 0);

      if (result.estimated > 0 || monthAdjustments.length > 0) {
        historyData.push({
          yearMonth,
          year: selectedYear,
          month: m,
          monthLabel: format(iterDate, 'yyyy年M月'),
          logs: result.logsWithAmounts as SalaryLogEntry[],
          adjustments: monthAdjustments,
          adjustmentTotal,
          finalTotal: result.estimated + adjustmentTotal,
          ...result,
        });
      }
    }
    return historyData;
  }, [logs, rates, adjustments, logsLoading, ratesLoading, logsPlaceholder, selectedYear, today]);

  // Filter and sort history (history は既に selectedYear のみ)
  const filteredHistory = useMemo(() => {
    let filtered = history;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.monthLabel.toLowerCase().includes(query) ||
          item.adjustments.some((a) => a.note?.toLowerCase().includes(query)),
      );
    }

    if (sortOrder === 'asc') {
      filtered = [...filtered].reverse();
    }

    return filtered;
  }, [history, searchQuery, sortOrder]);

  // Calculate yearly summary
  const yearlySummary = useMemo(() => {
    const yearData = history;
    return {
      total: yearData.reduce((sum, item) => sum + item.finalTotal, 0),
      classTotal: yearData.reduce((sum, item) => sum + item.details.class, 0),
      hourlyTotal: yearData.reduce((sum, item) => sum + item.details.hourly, 0),
      allowanceTotal: yearData.reduce((sum, item) => sum + item.details.allowance, 0),
      adjustmentTotal: yearData.reduce((sum, item) => sum + item.adjustmentTotal, 0),
      monthCount: yearData.length,
    };
  }, [history]);

  // Handlers
  const handleDownloadCSV = (item: HistoryItem) => {
    try {
      const headers = ['日付', '曜日', '区分', '詳細', '実績', '給与', '状態', '備考'];
      const rows = item.logs.map((log: unknown) => {
        const typedLog = log as SalaryLogEntry;
        const date = parseISO(typedLog.date);
        const type =
          typedLog.work_type === 'class'
            ? '授業'
            : typedLog.work_type === 'hourly'
              ? '規定外'
              : '手当';

        let detail: string;
        if (typedLog.work_type === 'class') detail = typedLog.period_name || '授業';
        else if (typedLog.work_type === 'hourly') detail = typedLog.note || '';
        else detail = typedLog.note || '';

        let amount = '';
        if (typedLog.work_type === 'class') amount = `${typedLog.student_count}名`;
        else if (typedLog.work_type === 'hourly') {
          const m = typedLog.duration_minutes || 0;
          amount = `${Math.floor(m / 60)}h${m % 60}m`;
        }

        const salary = typedLog.amount;
        const status = typedLog.status === 'completed' ? '確定' : '予定';

        return [
          csvCell(format(date, 'yyyy/MM/dd')),
          csvCell(format(date, 'E', { locale: ja })),
          csvCell(type),
          csvCell(detail),
          csvCell(amount),
          csvCell(salary),
          csvCell(status),
          csvCell(typedLog.note || ''),
        ].join(',');
      });

      item.adjustments.forEach((adj) => {
        rows.push(
          [
            csvCell(item.yearMonth.replace('-', '/') + '/01'),
            csvCell(''),
            csvCell('調整'),
            csvCell(
              (ADJUSTMENT_TYPE_INFO as Record<string, { label: string }>)[adj.adjustment_type]
                ?.label || adj.adjustment_type,
            ),
            csvCell(''),
            csvCell(adj.amount),
            csvCell('確定'),
            csvCell(adj.note || ''),
          ].join(','),
        );
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `salary_${item.monthLabel.replace(/[^0-9]/g, '')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV download failed:', error);
      toast.error('CSVのダウンロードに失敗しました');
    }
  };

  const handlePrint = async (item: HistoryItem) => {
    try {
      const response = await pdfApi.getSalaryPdf(item.year, item.month);
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `salary_${item.monthLabel.replace(/[^0-9]/g, '')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('PDFの生成に失敗しました。');
    }
  };

  const toggleAdjustmentExpand = (yearMonth: string) => {
    setExpandedAdjustments((prev) => ({ ...prev, [yearMonth]: !prev[yearMonth] }));
  };

  const handleSaveAdjustment = async (data: Record<string, unknown>, existingId?: number) => {
    if (existingId) {
      await updateMutation.mutateAsync({ id: existingId, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleDeleteAdjustment = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const openAdjustmentModal = (
    yearMonth: string,
    monthLabel: string,
    baseAmount: number,
    existing?: SalaryAdjustmentRecord,
  ) => {
    setAdjustmentModal({
      isOpen: true,
      yearMonth,
      monthLabel,
      baseAmount,
      existing: existing ?? null,
    });
  };

  // logsPlaceholder: 年切り替え直後は前の年のデータが placeholder として
  // 残っているため、誤った金額を一瞬表示しないようスケルトンを出す
  const isLoading = logsLoading || ratesLoading || adjustmentsLoading || logsPlaceholder;

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-4 pb-24 w-full mx-auto max-w-2xl">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Wallet className="text-blue-600" />
          給与履歴
        </h2>
        <SkeletonRow count={4} height="h-40" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 w-full mx-auto max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Wallet className="text-blue-600" />
        給与履歴
      </h2>

      {/* Year Selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {availableYears.map((year) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-all ${
              selectedYear === year
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {year}年
          </button>
        ))}
      </div>

      <SalaryYearlySummary selectedYear={selectedYear} summary={yearlySummary} />

      {/* Search & Sort */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="月・メモで検索..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
          />
        </div>
        <button
          onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
          className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1 text-sm text-gray-600"
        >
          {sortOrder === 'desc' ? <SortDesc size={18} /> : <SortAsc size={18} />}
          <span className="hidden sm:inline">{sortOrder === 'desc' ? '新しい順' : '古い順'}</span>
        </button>
      </div>

      {/* History Cards */}
      <div className="space-y-3">
        {filteredHistory.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            {searchQuery ? '検索結果がありません' : 'データがありません'}
          </div>
        )}

        {filteredHistory.map((item) => (
          <SalaryHistoryCard
            key={item.monthLabel}
            item={item}
            isAdjustmentExpanded={!!expandedAdjustments[item.yearMonth]}
            onToggleAdjustments={toggleAdjustmentExpand}
            onOpenAdjustmentModal={openAdjustmentModal}
            onDownloadCSV={handleDownloadCSV}
            onPrint={handlePrint}
          />
        ))}
      </div>

      <SalaryAdjustmentModal
        isOpen={adjustmentModal.isOpen}
        onClose={() =>
          setAdjustmentModal({
            isOpen: false,
            yearMonth: null,
            monthLabel: null,
            baseAmount: 0,
            existing: null,
          })
        }
        yearMonth={adjustmentModal.yearMonth ?? ''}
        monthLabel={adjustmentModal.monthLabel ?? ''}
        baseAmount={adjustmentModal.baseAmount || 0}
        existingAdjustment={adjustmentModal.existing ?? undefined}
        onSave={handleSaveAdjustment}
        onDelete={handleDeleteAdjustment}
      />
    </div>
  );
}
