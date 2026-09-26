/* global marked, DOMPurify */
(() => {
  'use strict';

  // ---- 表示用の定数 ----
  const TYPE_LABEL = { incident: '障害', maintenance: 'メンテ', update: '更新', resolved: '復旧' };
  const STATUS_LABEL = {
    none: 'なし',
    scheduled: '予定',
    investigating: '調査中',
    identified: '原因特定',
    monitoring: '経過観察',
    resolved: '解決済み',
  };
  // メンテ投稿では同じ status を運用の言葉で呼ぶ（monitoring = 実施中、none = 自動投稿の実施中）
  const MAINT_STATUS_LABEL = { none: '実施中（自動）', scheduled: '予定', monitoring: '実施中', resolved: '完了' };
  const INCIDENT_STEPS = ['investigating', 'identified', 'monitoring'];
  const STATUS_OPTIONS = {
    incident: ['investigating', 'identified', 'monitoring', 'resolved'],
    maintenance: ['scheduled', 'monitoring', 'resolved'],
  };
  // メンテ投稿は予告として書くことが多い。実施中にするのはメンテナンスモードの ON で自動投稿される
  const DEFAULT_STATUS = { incident: 'investigating', maintenance: 'scheduled', update: 'resolved', resolved: 'resolved' };
  const SOURCE_LABEL = { auto: '自動', admin: '管理画面', discord: 'Discord' };
  const STATE_LABEL = { operational: '稼働中', incident: '障害発生中', maintenance: 'メンテナンス中' };
  const POLL_INTERVAL_MS = 30000;
  const DEFAULT_RESOLVE_MESSAGE = 'サービスが復旧しました。ご迷惑をおかけしました。';

  const TEMPLATES = {
    incident: {
      type: 'incident',
      status: 'investigating',
      title: 'サービス障害発生',
      content:
        '## 状況\n\n現在、payroll.warionate.com にアクセスしづらい状態を確認しています。\n\n## 次の連絡\n\n原因が分かり次第お知らせします。',
    },
    progress: {
      type: 'update',
      status: 'resolved',
      title: '障害の続報',
      content: '原因の調査を続けています。\n\n判明し次第、続報をお伝えします。',
    },
    resolved: {
      type: 'resolved',
      status: 'resolved',
      title: 'サービス復旧',
      content: 'サービスが復旧しました。ご迷惑をおかけしました。',
    },
    maintenance: {
      type: 'maintenance',
      status: 'scheduled',
      title: 'メンテナンスのお知らせ',
      content: '## 日時\n\n（日時を記載）\n\n## 影響\n\nメンテナンス中はサービスをご利用いただけません。',
    },
  };

  // ---- 状態 ----
  /** /api/admin/summary の最新値 */
  let S = null;
  const UI = {
    editingId: null,
    type: 'update',
    status: 'resolved',
    preview: false,
    filter: 'all',
    expanded: new Set(),
    confirmDelete: null,
    confirmMaint: null, // 'on' | 'off'
    resolving: false,
    resolveMessage: DEFAULT_RESOLVE_MESSAGE,
    resolveRedirect: true,
    checking: false,
    pending: null, // 実行中の操作名（二重送信防止）
    sessionExpired: false,
    pollFailed: false,
  };

  // ---- helpers ----
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const hasStatus = (type) => type === 'incident' || type === 'maintenance';
  const isActive = (post) => post.status !== 'resolved' && post.status !== 'scheduled';
  const statusLabel = (type, status) =>
    (type === 'maintenance' ? MAINT_STATUS_LABEL[status] : undefined) ?? STATUS_LABEL[status] ?? status;
  const typeLabel = (type) => TYPE_LABEL[type] ?? type;
  const knownType = (type) => (TYPE_LABEL[type] ? type : 'update');
  const activeOf = (type) => (S ? S.activePosts.filter((p) => p.type === type) : []);
  const renderMarkdown = (src) => DOMPurify.sanitize(marked.parse(src || '', { breaks: true }));

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return url || '';
    }
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === now.toDateString()) return `今日 ${hm}`;
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function fmtClock(ts) {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(s / 86400);
    const clock = `${Math.floor((s % 86400) / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    return days > 0 ? `${days}日 ${clock}` : clock;
  }

  let toastTimer;
  function toast(message, isError = false) {
    const el = $('toast');
    el.textContent = message;
    el.className = `toast show${isError ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 5000 : 2600);
  }

  // ---- API ----
  function sessionExpiredError() {
    if (!UI.sessionExpired) {
      UI.sessionExpired = true;
      $('session-banner').hidden = false;
    }
    const err = new Error('ログインの有効期限が切れています');
    err.session = true;
    return err;
  }

  /**
   * 管理 API の呼び出し口。
   * - 状態を変えるリクエストには CSRF 対策のカスタムヘッダーを付ける（サーバー側で必須）。
   * - Cloudflare Access のセッションが切れると、ログイン画面への 302（redirect: 'manual' では
   *   opaqueredirect）や 401 / 403 が返る。汎用の失敗表示ではなく、再ログインを促すバナーを出す。
   */
  async function api(method, url, body) {
    const headers = {};
    if (method !== 'GET') headers['X-Admin-Request'] = '1';
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    });

    if (res.type === 'opaqueredirect' || res.status === 401) throw sessionExpiredError();
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && data.error === 'Invalid Access token') throw sessionExpiredError();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function fail(context, err) {
    console.error(`[Admin] ${context}:`, err);
    // セッション切れはバナーで案内済み
    if (err.session) return;
    toast(`${context}: ${err.message}`, true);
  }

  async function fetchSummary({ poll = false } = {}) {
    try {
      applySummary(await api('GET', '/api/admin/summary'), { poll });
      UI.pollFailed = false;
    } catch (err) {
      // 定期取得の一時的な失敗は、連続したときに1回だけ知らせる
      if (poll && !err.session && UI.pollFailed) {
        console.error('[Admin] poll failed again:', err);
        return;
      }
      if (poll) UI.pollFailed = true;
      fail('最新の状態を取得できませんでした', err);
    }
  }

  function applySummary(data, { poll = false } = {}) {
    S = data;
    // 解決フォームに入力中は、定期更新で書き換えて入力位置を失わせない
    if (!(poll && UI.resolving)) renderNow();
    renderSettings();
    renderPosts();
    renderComposer();
  }

  // ---- render: 現在の状態 ----
  function reasonHtml() {
    if (S.statusOverride !== 'auto') {
      return `<em>手動で「${esc(STATE_LABEL[S.statusOverride])}」に固定中</em> · 自動に戻すまで切り替わりません`;
    }
    const incident = activeOf('incident')[0];
    const maintenance = activeOf('maintenance')[0];
    // 優先順はサーバーの computeAutoStatus と同じ
    if (incident) return `自動判定 · 未解決の障害 #${incident.id} があります`;
    if (S.maintenanceMode) return '自動判定 · メンテナンスモードが ON です';
    if (maintenance) return `自動判定 · 進行中のメンテ #${maintenance.id} があります`;
    if (S.lastHealthStatus === 'down') return '自動判定 · ヘルスチェックが応答していません';
    if (S.lastHealthStatus === 'unknown') return '自動判定 · まだヘルスチェックの結果がありません';
    return '自動判定 · 問題は見つかっていません';
  }

  function healthHtml() {
    const hc = S.healthCheck;
    if (S.lastHealthStatus === 'down' && hc.plannedDowntime) {
      return '<span class="inline-state is-warn"><span class="dot dot--maintenance"></span>応答なし（計画停止）</span><span class="sub">メンテ中のため障害として扱っていません</span>';
    }
    if (S.lastHealthStatus === 'down') {
      const recovering = hc.consecutiveSuccesses > 0
        ? `<span class="sub">復旧を確認中 ${hc.consecutiveSuccesses}/${hc.recoveryThreshold}</span>`
        : '';
      return `<span class="inline-state is-bad"><span class="dot dot--incident"></span>応答なし</span>${recovering}`;
    }
    if (S.lastHealthStatus === 'up') {
      const failing = hc.consecutiveFailures > 0
        ? `<span class="sub">失敗 ${hc.consecutiveFailures}/${hc.failureThreshold}</span>`
        : '';
      return `<span class="inline-state"><span class="dot dot--operational"></span>応答あり</span>${failing}`;
    }
    return '<span class="inline-state"><span class="dot"></span>未確認</span>';
  }

  function renderNow() {
    const el = $('now');
    if (!S) {
      el.className = 'now';
      el.innerHTML = '<div class="now-main"><span class="now-eyebrow">公開ページのステータス</span><div class="now-state">読み込み中…</div></div>';
      return;
    }

    const status = S.status;
    const isDown = S.lastHealthStatus === 'down';
    const planned = S.healthCheck.plannedDowntime;
    const incident = activeOf('incident')[0];
    const host = hostOf(S.redirectUrl);
    el.className = `now now--${status}`;

    let visitor;
    if (S.redirectActive) {
      visitor = `<span class="inline-state">${esc(host)} へ転送</span>`;
    } else {
      visitor = '<span class="inline-state">ステータスページを表示</span>';
      if (S.redirectEnabled) {
        visitor += isDown && status === 'operational'
          ? '<span class="sub">リダイレクトは ON ですが、応答がないので止めています</span>'
          : '<span class="sub">リダイレクトは ON ですが、稼働中以外なので止まっています</span>';
      }
    }

    const lastCheck = S.lastCheckAt ? `${fmtClock(S.lastCheckAt)} 確認` : '未チェック';

    let respond = '';
    if (incident || (isDown && !planned)) {
      const since = isDown && S.lastDownAt ? Date.parse(S.lastDownAt) : incident ? incident.createdAt : null;
      const currentStep = incident ? INCIDENT_STEPS.indexOf(incident.status) : -1;
      const steps = incident
        ? INCIDENT_STEPS.map((step, i) => `
            <button type="button" data-step="${step}" aria-pressed="${step === incident.status}"
              class="${i < currentStep ? 'done' : ''}" ${UI.pending ? 'disabled' : ''}>${STATUS_LABEL[step]}</button>`).join('')
        : '';
      const others = activeOf('incident').slice(1);

      respond = `
        <div class="respond">
          <div class="respond-head">
            <span class="respond-title">${incident ? `<span class="mono">#${incident.id}</span>${esc(incident.title)}` : 'ヘルスチェックで応答なしを検知'}</span>
            ${since ? `<span class="elapsed mono" data-since="${since}">経過 ${fmtElapsed(Date.now() - since)}</span>` : ''}
          </div>
          <div class="respond-row">
            ${incident ? `<div class="steps" role="group" aria-label="#${incident.id} の進行状況"><span class="steps-label">進行状況</span>${steps}</div>` : '<span></span>'}
            <div class="respond-actions">
              <button class="btn" type="button" data-action="progress">続報を書く</button>
              ${incident ? `<button class="btn btn--primary" type="button" data-action="resolve-open" ${UI.resolving ? 'disabled' : ''}>解決する</button>` : ''}
            </div>
          </div>
          ${others.length ? `<p class="note-warn">ほかにも未解決の障害があります: ${others.map((p) => `#${p.id} ${esc(p.title)}`).join(' / ')}</p>` : ''}
          ${UI.resolving && incident ? resolvePanelHtml(incident, isDown) : ''}
        </div>`;
    }

    el.innerHTML = `
      <div class="now-main">
        <span class="now-eyebrow">公開ページのステータス</span>
        <div class="now-state"><span class="dot dot--${status}"></span>${STATE_LABEL[status]}</div>
        <p class="now-reason">${reasonHtml()}</p>
      </div>
      <dl class="now-facts">
        <div class="fact"><dt>訪問者に見えるもの</dt><dd>${visitor}</dd></div>
        <div class="fact"><dt>ヘルスチェック</dt><dd>${healthHtml()}</dd></div>
        <div class="fact"><dt>最終チェック</dt><dd><span class="mono">${lastCheck}</span>
          <button class="btn btn--sm" type="button" data-action="check" ${UI.checking ? 'disabled' : ''}>${UI.checking ? '確認中…' : '今すぐ確認'}</button></dd></div>
      </dl>
      ${respond}`;
  }

  function resolvePanelHtml(incident, isDown) {
    const redirectOn = S.redirectEnabled;
    return `
      <div class="resolve">
        <div class="field">
          <label class="label" for="r-content">復旧のお知らせ（「復旧」として投稿し Discord に通知。空欄なら投稿しません）</label>
          <textarea id="r-content">${esc(UI.resolveMessage)}</textarea>
        </div>
        <label class="check">
          <input type="checkbox" id="r-redirect" ${redirectOn || UI.resolveRedirect ? 'checked' : ''} ${redirectOn ? 'disabled' : ''}>
          <span>リダイレクトを再開する${redirectOn ? '（すでに ON）' : `（${esc(hostOf(S.redirectUrl))} への転送に戻す）`}</span>
        </label>
        ${isDown ? '<p class="note-warn">ヘルスチェックはまだ応答なしです。解決済みにしても、応答が戻るまで表示は「障害発生中」のままで、転送もしません。</p>' : ''}
        <div class="respond-actions">
          <button class="btn btn--primary" type="button" data-action="resolve-go" ${UI.pending ? 'disabled' : ''}>#${incident.id} を解決済みにする</button>
          <button class="btn btn--ghost" type="button" data-action="resolve-cancel">やめる</button>
        </div>
      </div>`;
  }

  // ---- render: 公開設定 ----
  function seg(name, options, value) {
    return `<div class="seg" role="group" data-seg="${name}">${options
      .map(([v, label, dot]) => `<button type="button" data-value="${v}" aria-pressed="${v === value}" ${UI.pending ? 'disabled' : ''}>${dot ? `<span class="dot dot--${dot}"></span>` : ''}${label}</button>`)
      .join('')}</div>`;
  }

  function renderSettings() {
    const el = $('settings');
    if (!S) {
      el.innerHTML = '<div class="loading-row">読み込み中…</div>';
      return;
    }

    const host = esc(hostOf(S.redirectUrl));
    const isDown = S.lastHealthStatus === 'down';

    const overrideDesc = {
      auto: 'ヘルスチェックと進行中の投稿から自動で決まります',
      operational: '<em>「稼働中」で固定中</em>：障害が起きても表示は変わりません（応答がない間は転送だけ止めます）',
      incident: '<em>「障害発生中」で固定中</em>：自動に戻すまで転送しません',
      maintenance: '<em>「メンテナンス中」で固定中</em>：この間に payroll-app が落ちても、障害として公開しません',
    }[S.statusOverride];

    let redirectDesc;
    if (!S.redirectEnabled) {
      redirectDesc = 'status ページをそのまま表示します。進行中の障害・メンテを投稿すると自動で OFF になります';
    } else if (S.redirectActive) {
      redirectDesc = `status ページへの訪問を ${host} に転送しています`;
    } else {
      redirectDesc = `<em>ON ですが停止中</em>：${isDown && S.status === 'operational' ? 'ヘルスチェックの応答が戻る' : '表示が「稼働中」に戻る'}と転送を再開します`;
    }

    const maintDesc = S.maintenanceMode
      ? `${host} へのアクセスをメンテナンス画面で止めています。OFF にすると進行中のメンテ投稿を解決済みにします`
      : `ON にすると ${host} へのアクセスをメンテナンス画面で止め、「メンテナンス開始」を投稿します`;

    const confirmText = UI.confirmMaint === 'on'
      ? `「メンテナンス開始」を公開フィードに投稿して Discord に通知し、最大10秒で ${host} にメンテナンス画面が出ます。`
      : '進行中のメンテ投稿をすべて解決済みにして（予定の投稿は残ります）、Discord に通知します。';

    el.innerHTML = `
      <div class="setting">
        <div class="setting-name">表示ステータス</div>
        <div class="setting-desc">${overrideDesc}</div>
        <div class="setting-control">${seg('override', [['auto', '自動'], ['operational', '稼働中', 'operational'], ['incident', '障害', 'incident'], ['maintenance', 'メンテ', 'maintenance']], S.statusOverride)}</div>
      </div>
      <div class="setting">
        <div class="setting-name">リダイレクト</div>
        <div class="setting-desc">${redirectDesc}</div>
        <div class="setting-control">${seg('redirect', [['on', 'ON'], ['off', 'OFF']], S.redirectEnabled ? 'on' : 'off')}</div>
      </div>
      <div class="setting">
        <div class="setting-name">メンテナンスモード</div>
        <div class="setting-desc">${maintDesc}</div>
        <div class="setting-control">${seg('maint', [['on', 'ON'], ['off', 'OFF']], S.maintenanceMode ? 'on' : 'off')}</div>
        ${UI.confirmMaint ? `
        <div class="confirm-bar">
          <span>${confirmText}</span>
          <button class="btn btn--sm btn--primary" type="button" data-action="maint-go" ${UI.pending ? 'disabled' : ''}>${UI.confirmMaint === 'on' ? 'ON にする' : 'OFF にする'}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-action="maint-cancel">やめる</button>
        </div>` : ''}
      </div>`;
  }

  // ---- render: 投稿一覧 ----
  function renderPosts() {
    $('filter').innerHTML = [['all', 'すべて'], ...Object.entries(TYPE_LABEL)]
      .map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${UI.filter === key}">${label}</button>`)
      .join('');

    if (!S) {
      $('post-count').textContent = '';
      $('posts').innerHTML = '<li class="empty">読み込み中…</li>';
      return;
    }

    const list = S.recentPosts.filter((p) => UI.filter === 'all' || p.type === UI.filter);
    $('post-count').textContent = `${list.length}件`;
    if (list.length === 0) {
      $('posts').innerHTML = `<li class="empty">${UI.filter === 'all' ? '投稿はまだありません' : 'この種別の投稿はありません'}</li>`;
      return;
    }

    $('posts').innerHTML = list.map((post) => {
      const id = Number(post.id);
      let chip = '';
      if (hasStatus(post.type)) {
        if (post.status === 'scheduled') chip = '<span class="chip chip--plan">予定</span>';
        else if (isActive(post)) chip = `<span class="chip ${post.type === 'incident' ? 'chip--open' : 'chip--open-m'}">${esc(statusLabel(post.type, post.status))}</span>`;
        else chip = `<span class="chip chip--done">${post.type === 'maintenance' ? '完了' : '解決済み'}</span>`;
      }
      const actions = UI.confirmDelete === id
        ? `<span class="post-confirm">削除しますか？
             <button type="button" class="btn btn--sm btn--danger-solid" data-action="delete-go" data-id="${id}">削除</button>
             <button type="button" class="btn btn--sm btn--ghost" data-action="delete-cancel">戻す</button></span>`
        : `<button type="button" class="btn btn--sm" data-action="edit" data-id="${id}">編集</button>
           <button type="button" class="btn btn--sm btn--ghost btn--danger" data-action="delete" data-id="${id}" aria-label="#${id} を削除">削除</button>`;
      const expanded = UI.expanded.has(id);

      return `
        <li class="post${UI.editingId === id ? ' is-editing' : ''}">
          <div class="post-row">
            <span class="post-time mono" title="${esc(new Date(post.createdAt).toLocaleString('ja-JP'))}">${fmtTime(post.createdAt)}</span>
            <div class="post-main">
              <button type="button" class="post-title" data-action="toggle-body" data-id="${id}" aria-expanded="${expanded}">${esc(post.title)}</button>
              <div class="post-meta">
                <span class="type-tag"><span class="dot dot--${knownType(post.type)}"></span>${esc(typeLabel(post.type))}</span>
                ${chip}
                <span>${esc(SOURCE_LABEL[post.source] ?? post.source)}</span>
                <span class="mono">#${id}</span>
                ${post.updatedAt ? '<span>編集済み</span>' : ''}
              </div>
            </div>
            <div class="post-actions">${actions}</div>
          </div>
          ${expanded ? `<div class="post-body md">${renderMarkdown(post.content)}</div>` : ''}
        </li>`;
    }).join('');
  }

  // ---- render: 投稿フォーム ----
  function effectsHtml(editing, post) {
    const items = [];
    const note = (text) => items.push({ text });
    const warn = (text) => items.push({ text, warn: true });

    const status = hasStatus(UI.type) ? UI.status : DEFAULT_STATUS[UI.type];
    const active = hasStatus(UI.type) && isActive({ status });
    const overrideAuto = !S || S.statusOverride === 'auto';

    if (editing) {
      note('公開フィードの内容を書き換えます');
      note('Discord には通知しません');
      const wasActive = post ? hasStatus(post.type) && isActive(post) : false;
      if (wasActive && !active) warn('進行中から外れ、表示ステータスの判定に使われなくなります');
      if (!wasActive && active) {
        warn(overrideAuto
          ? `進行中になり、表示ステータスが「${STATE_LABEL[UI.type]}」になります（リダイレクトは変わりません）`
          : '進行中になります（表示ステータスは手動固定中のため変わりません）');
      }
    } else {
      note('公開フィードにすぐ表示します');
      note('Discord に通知します');
      if (active) {
        if (S?.redirectEnabled) warn('リダイレクトを OFF にします（解決しても自動では戻りません）');
        warn(overrideAuto
          ? `表示ステータスが「${STATE_LABEL[UI.type]}」になります`
          : '表示ステータスは手動固定中のため変わりません');
        if (UI.type === 'maintenance') note('payroll-app は止まりません。止めるときは「メンテナンスモード」を ON にします');
      } else if (UI.type === 'maintenance' && status === 'scheduled') {
        note('予定なので、表示ステータスとリダイレクトは変わりません');
      }
      const openIncident = activeOf('incident')[0];
      if (UI.type === 'resolved' && openIncident) {
        warn(`未解決の障害 #${openIncident.id} は解決済みになりません。上の「解決する」を使ってください`);
      }
    }

    return `<li class="effects-title">${editing ? '更新すると' : '投稿すると'}</li>${items
      .map((item) => `<li${item.warn ? ' class="warn"' : ''}>${esc(item.text)}</li>`)
      .join('')}`;
  }

  function renderComposer() {
    const editing = UI.editingId != null;
    const post = editing && S ? S.recentPosts.find((p) => p.id === UI.editingId) : null;

    $('composer').classList.toggle('is-editing', editing);
    $('composer-h').textContent = editing ? `#${UI.editingId} を編集` : '新規投稿';
    $('template').hidden = editing;
    $('submit').textContent = editing ? '更新する' : '投稿する';
    $('submit').disabled = UI.pending === 'submit';
    $('cancel-edit').hidden = !editing;

    $('f-type').innerHTML = Object.entries(TYPE_LABEL)
      .map(([key, label]) => `<button type="button" data-type="${key}" aria-pressed="${UI.type === key}"><span class="dot dot--${key}"></span>${label}</button>`)
      .join('');

    const showStatus = hasStatus(UI.type);
    $('status-field').hidden = !showStatus;
    if (showStatus) {
      const options = [...STATUS_OPTIONS[UI.type]];
      if (!options.includes(UI.status)) options.unshift(UI.status);
      $('f-status').innerHTML = options
        .map((s) => `<button type="button" data-status="${esc(s)}" aria-pressed="${UI.status === s}">${esc(statusLabel(UI.type, s))}</button>`)
        .join('');
    }

    $('effects').innerHTML = effectsHtml(editing, post);

    $('f-content').hidden = UI.preview;
    $('preview').hidden = !UI.preview;
    $('tab-write').setAttribute('aria-pressed', String(!UI.preview));
    $('tab-preview').setAttribute('aria-pressed', String(UI.preview));
    if (UI.preview) {
      const content = $('f-content').value;
      $('preview').innerHTML = content.trim() ? renderMarkdown(content) : '<p class="muted">本文がまだありません</p>';
    }
  }

  function renderAll() {
    renderNow();
    renderSettings();
    renderPosts();
    renderComposer();
  }

  // ---- 投稿フォームの操作 ----
  function fillComposer({ type, status, title, content }) {
    UI.type = type;
    UI.status = hasStatus(type) ? status : DEFAULT_STATUS[type];
    $('f-title').value = title;
    $('f-content').value = content;
  }

  function resetComposer() {
    UI.editingId = null;
    UI.type = 'update';
    UI.status = 'resolved';
    UI.preview = false;
    $('f-title').value = '';
    $('f-content').value = '';
    $('template').value = '';
  }

  const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

  function startEdit(id) {
    const post = S?.recentPosts.find((p) => p.id === id);
    if (!post) return;
    UI.editingId = id;
    UI.preview = false;
    fillComposer(post);
    renderPosts();
    renderComposer();
    if (isNarrow()) $('composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f-title').focus({ preventScroll: true });
  }

  function useTemplate(name) {
    const template = TEMPLATES[name];
    if (!template) return;
    if (UI.editingId != null) resetComposer();
    fillComposer(template);
    UI.preview = false;
    $('template').value = name;
    renderPosts();
    renderComposer();
    if (isNarrow()) $('composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f-title').focus({ preventScroll: true });
    $('f-title').select();
  }

  function changeType(type) {
    UI.type = type;
    if (!hasStatus(type)) {
      UI.status = DEFAULT_STATUS[type];
    } else if (UI.editingId == null || !STATUS_OPTIONS[type].includes(UI.status)) {
      UI.status = DEFAULT_STATUS[type];
    }
    renderComposer();
  }

  async function submitPost(event) {
    event.preventDefault();
    if (UI.pending) return;

    const title = $('f-title').value.trim();
    const content = $('f-content').value.trim();
    if (!title) {
      toast('タイトルを入力してください', true);
      $('f-title').focus();
      return;
    }
    if (!content) {
      toast('本文を入力してください', true);
      UI.preview = false;
      renderComposer();
      $('f-content').focus();
      return;
    }

    const editing = UI.editingId != null;
    const id = UI.editingId;
    const body = { type: UI.type, status: hasStatus(UI.type) ? UI.status : DEFAULT_STATUS[UI.type], title, content };

    UI.pending = 'submit';
    renderComposer();
    try {
      const post = editing
        ? await api('PUT', `/api/admin/posts/${id}`, body)
        : await api('POST', '/api/admin/posts', body);
      toast(editing ? `#${id} を更新しました` : `#${post.id} を投稿しました`);
      resetComposer();
      await fetchSummary();
    } catch (err) {
      fail(editing ? '更新できませんでした' : '投稿できませんでした', err);
    } finally {
      UI.pending = null;
      renderComposer();
    }
  }

  // ---- 状態を変える操作 ----
  async function runOperation(name, fn, errorContext) {
    if (UI.pending) return;
    UI.pending = name;
    renderSettings();
    renderNow();
    try {
      await fn();
      await fetchSummary();
    } catch (err) {
      fail(errorContext, err);
    } finally {
      UI.pending = null;
      renderSettings();
      renderNow();
    }
  }

  function changeSetting(name, value) {
    if (!S) return;

    if (name === 'maint') {
      const wantOn = value === 'on';
      UI.confirmMaint = wantOn === S.maintenanceMode ? null : value;
      renderSettings();
      return;
    }

    if (name === 'override') {
      if (value === S.statusOverride) return;
      runOperation('override', async () => {
        await api('POST', '/api/admin/set-status-override', { value });
        toast(value === 'auto' ? '表示ステータスを自動判定に戻しました' : `表示ステータスを「${STATE_LABEL[value]}」に固定しました`);
      }, '表示ステータスを変更できませんでした');
      return;
    }

    if (name === 'redirect') {
      const enabled = value === 'on';
      if (enabled === S.redirectEnabled) return;
      runOperation('redirect', async () => {
        await api('POST', '/api/admin/set-redirect', { enabled });
        toast(enabled ? 'リダイレクトを ON にしました' : 'リダイレクトを OFF にしました');
      }, 'リダイレクトを切り替えできませんでした');
    }
  }

  function applyMaintenance() {
    const enabled = UI.confirmMaint === 'on';
    runOperation('maint', async () => {
      await api('POST', '/api/admin/set-maintenance', { enabled });
      UI.confirmMaint = null;
      toast(enabled ? 'メンテナンスモードを ON にしました' : 'メンテナンスモードを OFF にしました');
    }, 'メンテナンスモードを切り替えできませんでした');
  }

  function setIncidentStep(status) {
    const incident = activeOf('incident')[0];
    if (!incident || incident.status === status) return;
    runOperation('step', async () => {
      await api('PUT', `/api/admin/posts/${incident.id}`, { status });
      toast(`#${incident.id} を「${STATUS_LABEL[status]}」にしました`);
    }, '進行状況を変更できませんでした');
  }

  function resolveIncident() {
    const incident = activeOf('incident')[0];
    if (!incident) return;
    const message = UI.resolveMessage;
    const resumeRedirect = S.redirectEnabled ? false : UI.resolveRedirect;
    runOperation('resolve', async () => {
      const result = await api('POST', `/api/admin/posts/${incident.id}/resolve`, { message, resumeRedirect });
      UI.resolving = false;
      UI.resolveMessage = DEFAULT_RESOLVE_MESSAGE;
      toast(result.recoveryPost ? `#${incident.id} を解決済みにし、復旧を投稿しました` : `#${incident.id} を解決済みにしました`);
    }, '解決できませんでした');
  }

  async function runCheck() {
    if (UI.checking) return;
    UI.checking = true;
    renderNow();
    try {
      const data = await api('POST', '/api/admin/health-check');
      UI.checking = false;
      applySummary(data);
      if (data.probe?.ok) {
        toast('確認しました：応答あり');
      } else {
        toast(`確認しました：応答なし（${data.probe?.reason ?? '理由不明'}）。手動の確認は障害判定に数えません`, true);
      }
    } catch (err) {
      fail('ヘルスチェックを実行できませんでした', err);
    } finally {
      UI.checking = false;
      renderNow();
    }
  }

  function deletePost(id) {
    runOperation('delete', async () => {
      await api('DELETE', `/api/admin/posts/${id}`);
      UI.confirmDelete = null;
      UI.expanded.delete(id);
      if (UI.editingId === id) resetComposer();
      toast(`#${id} を削除しました`);
    }, '削除できませんでした');
  }

  // ---- イベント（CSP でイベント属性が使えないので委譲で配線する） ----
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const d = button.dataset;

    const segEl = button.closest('[data-seg]');
    if (segEl && d.value !== undefined) {
      changeSetting(segEl.dataset.seg, d.value);
      return;
    }
    if (d.filter) {
      UI.filter = d.filter;
      renderPosts();
      return;
    }
    if (d.type) {
      changeType(d.type);
      return;
    }
    if (d.status) {
      UI.status = d.status;
      renderComposer();
      return;
    }
    if (d.step) {
      setIncidentStep(d.step);
      return;
    }

    const id = d.id !== undefined ? Number(d.id) : null;
    switch (d.action) {
      case 'reload':
        location.reload();
        break;
      case 'check':
        runCheck();
        break;
      case 'progress':
        useTemplate('progress');
        break;
      case 'resolve-open':
        UI.resolving = true;
        UI.resolveRedirect = true;
        renderNow();
        $('r-content')?.focus();
        break;
      case 'resolve-cancel':
        UI.resolving = false;
        renderNow();
        break;
      case 'resolve-go':
        resolveIncident();
        break;
      case 'maint-go':
        applyMaintenance();
        break;
      case 'maint-cancel':
        UI.confirmMaint = null;
        renderSettings();
        break;
      case 'toggle-body':
        if (UI.expanded.has(id)) UI.expanded.delete(id);
        else UI.expanded.add(id);
        renderPosts();
        break;
      case 'edit':
        startEdit(id);
        break;
      case 'delete':
        UI.confirmDelete = id;
        renderPosts();
        break;
      case 'delete-cancel':
        UI.confirmDelete = null;
        renderPosts();
        break;
      case 'delete-go':
        deletePost(id);
        break;
      case 'tab-write':
      case 'tab-preview':
        UI.preview = d.action === 'tab-preview';
        renderComposer();
        break;
      case 'cancel-edit':
        resetComposer();
        renderPosts();
        renderComposer();
        break;
      default:
        break;
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'r-content') UI.resolveMessage = event.target.value;
    if (event.target.id === 'f-content' && UI.preview) renderComposer();
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'r-redirect') UI.resolveRedirect = event.target.checked;
    if (event.target.id === 'template') useTemplate(event.target.value);
  });

  $('post-form').addEventListener('submit', submitPost);
  $('composer').addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      $('post-form').requestSubmit();
    }
  });

  // 障害の経過時間
  setInterval(() => {
    document.querySelectorAll('[data-since]').forEach((el) => {
      el.textContent = `経過 ${fmtElapsed(Date.now() - Number(el.dataset.since))}`;
    });
  }, 1000);

  renderAll();
  fetchSummary();
  setInterval(() => {
    if (!UI.sessionExpired) fetchSummary({ poll: true });
  }, POLL_INTERVAL_MS);
})();
