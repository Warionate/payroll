/* PWA 白画面のセルフヒール。
   アプリ更新時、古い index.html がもう存在しない JS チャンクを参照して
   起動できなくなる（エントリ/vendor チャンクの読み込み失敗 → React が
   マウントできず真っ白）ことがある。その場合に一度だけ Service Worker と
   キャッシュを破棄してリロードし、最新の資産を取り直すことで、手動での
   PWA 再インストールを不要にする。
   CSP (script-src 'self') 対応のためインラインではなく外部ファイルで読み込む。 */
(function () {
  const KEY = 'sw-recovery-attempt';

  function recover() {
    // 1 セッションにつき 1 回だけ。回復後も起動できない場合に
    // 無限リロードへ陥らないようにする（成功時は main.tsx が解除する）。
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return; // sessionStorage 不可な環境ではループ防止のため何もしない
    }

    const reload = function () {
      window.location.reload();
    };
    const tasks = [];

    if ('serviceWorker' in navigator) {
      tasks.push(
        navigator.serviceWorker
          .getRegistrations()
          .then(function (regs) {
            return Promise.all(
              regs.map(function (r) {
                return r.unregister();
              }),
            );
          })
          .catch(function () {}),
      );
    }
    if (window.caches && caches.keys) {
      tasks.push(
        caches
          .keys()
          .then(function (keys) {
            return Promise.all(
              keys.map(function (k) {
                return caches.delete(k);
              }),
            );
          })
          .catch(function () {}),
      );
    }

    Promise.all(tasks).then(reload, reload);
  }

  // Vite の動的 import / preload 失敗（チャンク欠落）
  window.addEventListener('vite:preloadError', function () {
    recover();
  });

  // <script> / <link> リソースの読み込み失敗（エントリ・vendor チャンク等）。
  // リソースエラーはバブリングしないため capture フェーズで拾う。
  window.addEventListener(
    'error',
    function (e) {
      const t = e && e.target;
      if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) recover();
    },
    true,
  );
})();
