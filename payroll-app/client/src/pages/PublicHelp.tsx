import React, { useState } from 'react';
import { Link } from 'react-router';
import Help from './Help';
import { ArrowLeft } from 'lucide-react';
import LegalModal from '../components/common/LegalModal';

export default function PublicHelp() {
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-header.svg" alt="Payroll App" className="h-8" />
            <span className="hidden sm:inline font-bold text-gray-500 text-sm ml-2 border-l pl-2">
              ユーザーマニュアル
            </span>
          </div>
          <Link
            to="/login"
            className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="sm:hidden">ログイン</span>
            <span className="hidden sm:inline">ログイン画面へ戻る</span>
          </Link>
        </div>
      </header>

      <main className="py-8">
        <Help />
      </main>

      <footer className="bg-white border-t border-gray-200 mt-12 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="flex justify-center gap-4 text-xs text-gray-400 mb-4">
            <button
              type="button"
              onClick={() => setActiveModal('terms')}
              className="hover:text-gray-600 hover:underline"
            >
              利用規約
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('privacy')}
              className="hover:text-gray-600 hover:underline"
            >
              プライバシーポリシー
            </button>
          </div>
          <p className="text-gray-500 text-sm">&copy; 2026 Warionate.</p>
        </div>
      </footer>

      <LegalModal activeModal={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}
