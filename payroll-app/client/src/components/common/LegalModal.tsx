import { X } from 'lucide-react';
import TermsContent from './TermsContent';
import PrivacyContent from './PrivacyContent';

interface LegalModalProps {
  activeModal: 'terms' | 'privacy' | null;
  onClose: () => void;
}

export default function LegalModal({ activeModal, onClose }: LegalModalProps) {
  if (!activeModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overlay-safe bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-full flex flex-col overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-gray-800">
            {activeModal === 'terms' ? '利用規約' : 'プライバシーポリシー'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {activeModal === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
