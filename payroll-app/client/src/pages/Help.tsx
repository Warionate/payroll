import HelpGettingStarted from './help/HelpGettingStarted';
import HelpAdvancedFeatures from './help/HelpAdvancedFeatures';
import { useState } from 'react';
import LegalModal from '../components/common/LegalModal';

export default function Help() {
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  return (
    <div className="h-full overflow-y-auto max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
      <div className="text-center space-y-4 mb-8">
        <h1 className="text-3xl font-bold text-gray-900">ユーザーマニュアル</h1>
        <p className="text-gray-600">
          給与計算アプリの詳しい使い方と、安全にご利用いただくための重要事項
        </p>
      </div>

      <HelpGettingStarted />
      <HelpAdvancedFeatures />

      <div className="pt-8 mt-8 border-t border-gray-200">
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <button
            type="button"
            onClick={() => setActiveModal('terms')}
            className="hover:text-blue-600 transition-colors"
          >
            利用規約
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('privacy')}
            className="hover:text-blue-600 transition-colors"
          >
            プライバシーポリシー
          </button>
        </div>
      </div>

      <LegalModal activeModal={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}
