import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import LegalModal from '../common/LegalModal';

/**
 * ログイン・新規登録の画面の枠（ロゴ・切り替えタブ・下の案内リンク）
 */
export default function AuthShell({
  mode,
  children,
  wide = false,
}: {
  mode: 'login' | 'register';
  children: ReactNode;
  wide?: boolean;
}) {
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg">
          <img
            src="/logo-header.svg"
            alt="Payroll App"
            className="h-10 mx-auto mb-5"
            fetchPriority="high"
          />
          <h1 className="sr-only">{mode === 'login' ? 'ログイン' : 'アカウント作成'}</h1>

          <nav
            className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg mb-5"
            aria-label="ログインと新規登録の切り替え"
          >
            {(
              [
                ['login', 'ログイン', '/login'],
                ['register', '新規登録', '/register'],
              ] as const
            ).map(([key, label, to]) => (
              <Link
                key={key}
                to={to}
                replace
                aria-current={mode === key ? 'page' : undefined}
                className={`py-2 rounded-md text-sm font-bold text-center transition-colors ${
                  mode === key
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {children}
        </div>

        <div className="mt-4 flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <a href="/guide" className="hover:text-gray-600 hover:underline">
            使い方
          </a>
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
          <span>&copy; 2026 Warionate</span>
        </div>
      </div>

      <LegalModal activeModal={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}
