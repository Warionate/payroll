/* global marked, DOMPurify */

const POLL_INTERVAL = 30000;
let lastPostId = -1;
let lastFeedSignature = '';

const typeLabels = {
  incident: '障害',
  maintenance: 'メンテナンス',
  update: 'アップデート',
  resolved: '復旧',
};

const statusLabels = {
  scheduled: '予定',
  investigating: '調査中',
  identified: '原因特定',
  monitoring: '経過観察',
  resolved: '解決済み',
};

const sourceLabels = {
  auto: '自動検知',
  admin: '管理者',
  discord: '管理者',
};

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const sameYear = d.getFullYear() === now.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  if (sameDay) return `${hh}:${mm}:${ss}`;
  if (sameYear) return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}:${ss}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}:${ss}`;
}

function updateStatusBadge(status) {
  const badge = document.getElementById('status-badge');
  const text = document.getElementById('status-text');
  const map = {
    operational: '稼働中',
    incident: '障害発生中',
    maintenance: 'メンテナンス中',
  };
  badge.className = `status-badge status-badge--${status}`;
  text.textContent = map[status] || '不明';
}

function renderHeroBanner(status) {
  const hero = document.getElementById('hero-banner');
  if (!hero) return;

  if (status === 'incident') {
    hero.hidden = false;
    hero.className = 'hero-banner hero-banner--incident';
    hero.innerHTML = `
      <div class="hero-banner__label">障害発生中</div>
      <div class="hero-banner__title">サービスが正常に応答していない状態を検知しています</div>
    `;
  } else if (status === 'maintenance') {
    hero.hidden = false;
    hero.className = 'hero-banner hero-banner--maintenance';
    hero.innerHTML = `
      <div class="hero-banner__label">メンテナンス中</div>
      <div class="hero-banner__title">現在、メンテナンスを実施しています</div>
    `;
  } else {
    hero.hidden = true;
  }
}

function renderPost(post) {
  // 既知の type のみクラス名に使う（HTML への生値補間を避ける）
  const safeType = typeLabels[post.type] ? post.type : 'update';
  const typeText = escapeHtml(typeLabels[post.type] || post.type);
  const hasStatus = post.status && post.status !== 'none';
  const statusText = hasStatus ? escapeHtml(statusLabels[post.status] || post.status) : '';
  const sourceText = escapeHtml(sourceLabels[post.source] || post.source);
  const time = formatTime(post.createdAt);
  const tooltipTime = new Date(post.createdAt).toLocaleString('ja-JP');
  // Markdown 中の生 HTML / イベントハンドラ属性を除去してから挿入する
  const htmlContent = DOMPurify.sanitize(marked.parse(post.content, { breaks: true }));

  return `
    <article class="post-card post-card--${safeType}" data-id="${Number(post.id)}">
      <div class="post-header">
        <div class="post-meta">
          <span class="post-type">${typeText}</span>
          ${hasStatus ? `<span>·</span><span>${statusText}</span>` : ''}
        </div>
        <span class="post-time" title="${tooltipTime}">${time}</span>
      </div>
      <h3 class="post-title">${escapeHtml(post.title)}</h3>
      <div class="post-content markdown-content">${htmlContent}</div>
      <div class="post-footer">
        ${sourceText}${post.updatedAt ? ' · 更新済み' : ''}
      </div>
    </article>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fetchAndRender() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 復旧してリダイレクトが有効になったら本家へ戻す
    if (data.redirectActive && data.redirectUrl) {
      window.location.replace(data.redirectUrl);
      return;
    }

    updateStatusBadge(data.status);
    renderHeroBanner(data.status);

    const feed = document.getElementById('feed');
    const loading = document.getElementById('loading');
    const empty = document.getElementById('feed-empty');

    loading.hidden = true;

    if (data.recentPosts.length === 0) {
      feed.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    feed.hidden = false;

    const newTopId = data.recentPosts[0]?.id || -1;
    if (lastPostId !== -1 && newTopId > lastPostId) {
      showUpdateIndicator();
    }

    // 件数と先頭 ID だけだと、状態の変更（調査中→解決済み）や上限件数での削除を
    // 取りこぼすため、各投稿の ID と更新時刻で変化を判定する
    const signature = data.recentPosts.map((p) => `${p.id}:${p.updatedAt || 0}`).join(',');
    if (signature !== lastFeedSignature) {
      feed.innerHTML = data.recentPosts.map(renderPost).join('');
      lastFeedSignature = signature;
    }
    lastPostId = newTopId;
  } catch (err) {
    console.error('[Feed] Fetch error:', err);
  }
}

function showUpdateIndicator() {
  const indicator = document.getElementById('update-indicator');
  indicator.classList.add('visible');
  setTimeout(() => indicator.classList.remove('visible'), 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  // CSP で inline handler を許可しないため、リロードボタンはここで配線する
  document.getElementById('update-indicator')?.addEventListener('click', () => location.reload());

  fetchAndRender();
  setInterval(fetchAndRender, POLL_INTERVAL);
});
