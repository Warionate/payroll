import { useEffect, useState } from 'react';

// 認証ロード中（最長 45 秒のリトライを含む）に表示する起動スプラッシュ。
// ヘッダー／ログインと同じ logo-header.svg を使い、ブランドの見た目を統一する。
// マウント前に index.html が描く静的スプラッシュと同一の見た目にして、
// React マウント前後で継ぎ目なく繋がるようにしている。

// この秒数を超えても終わらないとき、無言で固まって見えないよう一行添える。
const SLOW_NOTICE_MS = 15000;

export default function SplashScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <img src="/logo-header.svg" alt="Payroll App" className="w-60 h-auto" />
      <div className="mt-10 flex items-center gap-[9px]">
        <span className="splash-spinner" />
        <span className="text-[13px] font-normal tracking-[0.06em] text-gray-400">
          読み込み中です
        </span>
      </div>
      {slow && (
        <p className="mt-3 text-xs font-normal tracking-[0.05em] text-gray-300">
          読み込みに時間がかかっています
        </p>
      )}
    </div>
  );
}
