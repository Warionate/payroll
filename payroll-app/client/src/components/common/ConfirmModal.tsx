import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  showCancel?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  isDestructive = false,
  showCancel = true,
}: Props) {
  const { modalRef } = useModalAccessibility({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 overlay-safe animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-full overflow-y-auto animate-scale-in"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            {isDestructive && (
              <div className="bg-red-100 p-2 rounded-full text-red-500">
                <AlertTriangle size={24} />
              </div>
            )}
            <h3 id="confirm-modal-title" className="font-bold text-lg text-gray-800">
              {title || '確認'}
            </h3>
          </div>
          <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{message}</p>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
          {showCancel && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors text-sm"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white font-bold rounded-lg shadow-sm transition-colors text-sm ${
              isDestructive ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
