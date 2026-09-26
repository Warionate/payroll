/* ダークモード初期化。React マウント前に <html> へ class を付与して
   ライト→ダークのフラッシュを防ぐ。CSP (script-src 'self') 対応のため
   インラインではなく外部ファイルとして読み込む。 */
(function () {
  try {
    const t = localStorage.getItem('theme');
    const dark =
      t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch {
    /* localStorage が使えない環境ではライト表示のまま */
  }
})();
