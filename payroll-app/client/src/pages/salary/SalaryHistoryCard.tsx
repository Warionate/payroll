import { FileDown, FileText, Plus, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';
import { ADJUSTMENT_TYPE_INFO } from './constants';
import type { HistoryItem, SalaryAdjustmentRecord } from './constants';

interface Props {
  item: HistoryItem;
  isAdjustmentExpanded: boolean;
  onToggleAdjustments: (yearMonth: string) => void;
  onOpenAdjustmentModal: (
    yearMonth: string,
    monthLabel: string,
    baseAmount: number,
    existing?: SalaryAdjustmentRecord,
  ) => void;
  onDownloadCSV: (item: HistoryItem) => void;
  onPrint: (item: HistoryItem) => void;
}

export default function SalaryHistoryCard({
  item,
  isAdjustmentExpanded,
  onToggleAdjustments,
  onOpenAdjustmentModal,
  onDownloadCSV,
  onPrint,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      {/* Card Header */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{item.monthLabel} 支給分</h3>
            <p className="text-xs text-gray-500">{item.periodText}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              ¥{item.finalTotal.toLocaleString()}
            </div>
            {item.adjustmentTotal !== 0 && (
              <div
                className={`text-xs ${item.adjustmentTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                調整: {item.adjustmentTotal >= 0 ? '+' : ''}¥{item.adjustmentTotal.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Breakdown Grid */}
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t text-xs text-gray-600">
          <div className="text-center">
            <div className="font-bold text-gray-400 mb-1">授業給</div>
            <div>¥{item.details.class.toLocaleString()}</div>
          </div>
          <div className="text-center border-l border-gray-100">
            <div className="font-bold text-gray-400 mb-1">規定外</div>
            <div>¥{item.details.hourly.toLocaleString()}</div>
          </div>
          <div className="text-center border-l border-gray-100">
            <div className="font-bold text-gray-400 mb-1">手当</div>
            <div>¥{item.details.allowance.toLocaleString()}</div>
          </div>
          <div className="text-center border-l border-gray-100">
            <div className="font-bold text-gray-400 mb-1">調整</div>
            <div className={item.adjustmentTotal >= 0 ? 'text-green-600' : 'text-red-600'}>
              {item.adjustmentTotal >= 0 ? '+' : ''}¥{item.adjustmentTotal.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Adjustments Section */}
      {item.adjustments.length > 0 && (
        <div className="border-t">
          <button
            onClick={() => onToggleAdjustments(item.yearMonth)}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">調整履歴 ({item.adjustments.length}件)</span>
            {isAdjustmentExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {isAdjustmentExpanded && (
            <div className="px-4 pb-3 space-y-2">
              {item.adjustments.map((adj) => {
                const typeInfo = ADJUSTMENT_TYPE_INFO[adj.adjustment_type];
                const Icon = typeInfo?.icon || MoreHorizontal;
                return (
                  <button
                    key={adj.id}
                    onClick={() =>
                      onOpenAdjustmentModal(item.yearMonth, item.monthLabel, item.estimated, adj)
                    }
                    className="w-full flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors"
                  >
                    <Icon size={14} className={typeInfo?.color || 'text-gray-500'} />
                    <span className="flex-1 text-sm text-gray-700">
                      {adj.note || typeInfo?.label}
                    </span>
                    <span
                      className={`font-bold text-sm ${adj.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {adj.amount >= 0 ? '+' : ''}¥{adj.amount.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
        <button
          onClick={() => onOpenAdjustmentModal(item.yearMonth, item.monthLabel, item.estimated)}
          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
        >
          <Plus size={14} /> 調整を追加
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => onDownloadCSV(item)}
            className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-blue-600 transition-colors"
          >
            <FileDown size={14} /> CSV
          </button>
          <button
            onClick={() => onPrint(item)}
            className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-red-600 transition-colors"
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>
    </div>
  );
}
