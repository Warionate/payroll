import HelpGettingStarted from './help/HelpGettingStarted';
import HelpSecurity from './help/HelpSecurity';
import HelpAdvancedFeatures from './help/HelpAdvancedFeatures';
import { useEffect } from 'react';
import { useLegalModal } from '../hooks/useLegalModal';

/** 目次（章の id は help/ の各 HelpSection と合わせる） */
const TOC: { id: string; label: string }[] = [
  { id: 'intro', label: 'はじめに' },
  { id: 'account', label: 'アカウント作成とログイン' },
  { id: 'setup', label: '最初の設定' },
  { id: 'home', label: 'ホーム画面の見方' },
  { id: 'settings', label: '設定画面の使い方' },
  { id: 'work', label: '日々の業務（勤務入力）' },
  { id: 'calendar', label: 'カレンダー連携' },
  { id: 'security', label: 'アカウントの安全' },
  { id: 'faq', label: '困ったとき（よくある質問）' },
  { id: 'broadcast', label: 'お知らせ' },
  { id: 'history', label: '給与履歴と明細出力' },
  { id: 'push', label: 'プッシュ通知' },
  { id: 'support', label: 'サポート・お問い合わせ' },
  { id: 'tech', label: '技術情報・ソースコード' },
];

export default function Help() {
  const legal = useLegalModal();

  const jump = (id: string) =>
    document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // /guide#help-faq のように章を指定して開かれたら、その章まで送る（ページは遅れて描画されるため自前で）
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <div className="h-full overflow-y-auto max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
      <div className="text-center space-y-4 mb-4">
        <h1 className="text-3xl font-bold text-gray-900">ユーザーマニュアル</h1>
        <p className="text-gray-600">
          給与計算アプリの詳しい使い方と、安全にご利用いただくための重要事項
        </p>
      </div>

      <nav aria-label="目次" className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-bold text-gray-500 mb-3">目次</h2>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {TOC.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => jump(item.id)}
                className="w-full text-left py-1.5 text-sm text-blue-700 hover:text-blue-900 hover:underline flex gap-2"
              >
                <span className="text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <HelpGettingStarted />
      <HelpSecurity />
      <HelpAdvancedFeatures />

      <div className="pt-8 mt-8 border-t border-gray-200">
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <button
            type="button"
            onClick={() => legal.open('terms')}
            className="hover:text-blue-600 transition-colors"
          >
            利用規約
          </button>
          <button
            type="button"
            onClick={() => legal.open('privacy')}
            className="hover:text-blue-600 transition-colors"
          >
            プライバシーポリシー
          </button>
        </div>
      </div>

      {legal.modal}
    </div>
  );
}
