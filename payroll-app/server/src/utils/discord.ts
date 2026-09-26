/**
 * Discord Webhook 通知ユーティリティ
 *
 * 失敗してもアプリ本体の処理を妨げないよう fire-and-forget。
 * カテゴリごとに専用 Webhook URL を設定可能。未設定なら DISCORD_WEBHOOK_URL に
 * フォールバック、それも未設定なら何もしない。
 */
import logger from './logger.js';

type Category = 'register' | 'security' | 'error' | 'ops' | 'admin';

type DiscordField = { name: string; value: string; inline?: boolean };

type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
  timestamp?: string;
};

const COLORS = {
  green: 0x4caf50,
  blue: 0x2196f3,
  yellow: 0xffc107,
  orange: 0xff9800,
  red: 0xf44336,
  purple: 0x9c27b0,
} as const;

function resolveWebhookUrl(category: Category): string | undefined {
  const specific = process.env[`DISCORD_${category.toUpperCase()}_WEBHOOK_URL`];
  return specific || process.env.DISCORD_WEBHOOK_URL;
}

async function postWebhook(
  url: string,
  payload: { content?: string; embeds?: DiscordEmbed[] },
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn(`Discord webhook responded with ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    logger.warn(`Discord webhook failed: ${(err as Error).message}`);
  }
}

function send(category: Category, embed: DiscordEmbed): Promise<void> {
  const url = resolveWebhookUrl(category);
  if (!url) return Promise.resolve();
  return postWebhook(url, {
    embeds: [{ timestamp: new Date().toISOString(), ...embed }],
  });
}

function truncate(value: string, max = 1000): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}

export function notifyNewUserRegistration(username: string, userId: number | bigint): void {
  void send('register', {
    title: '新規ユーザー登録',
    color: COLORS.green,
    fields: [
      { name: 'ユーザー名', value: username, inline: true },
      { name: 'ID', value: String(userId), inline: true },
    ],
  });
}

// レート制限ハンドラは超過リクエストごとに呼ばれるため、無制限に通知すると
// 負荷時/攻撃時に Discord webhook がスパムする（dedupe 無しが弱点だった）。
// 同一 (種別 × IP) は一定時間に 1 回だけ通知する。worker ごとのインメモリ
// マップなので、最悪でも「ワーカー数 × 1通 / cooldown」に収まる。
const RL_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
const lastRateLimitNotifyAt = new Map<string, number>();
function shouldNotifyRateLimit(kind: string, ip: string | undefined): boolean {
  const key = `${kind}:${ip ?? 'unknown'}`;
  const now = Date.now();
  const last = lastRateLimitNotifyAt.get(key) ?? 0;
  if (now - last < RL_NOTIFY_COOLDOWN_MS) return false;
  lastRateLimitNotifyAt.set(key, now);
  // マップの肥大を防ぐ（期限切れエントリを掃除）
  if (lastRateLimitNotifyAt.size > 1000) {
    for (const [k, t] of lastRateLimitNotifyAt) {
      if (now - t >= RL_NOTIFY_COOLDOWN_MS) lastRateLimitNotifyAt.delete(k);
    }
  }
  return true;
}

export function notifyRateLimitExceeded(params: {
  kind: 'login' | 'register' | 'global';
  ip: string | undefined;
  username?: string;
  userAgent?: string;
}): void {
  if (!shouldNotifyRateLimit(params.kind, params.ip)) return;

  const fields: DiscordField[] = [
    { name: '種類', value: params.kind, inline: true },
    { name: 'IP', value: params.ip || '不明', inline: true },
  ];
  if (params.username) fields.push({ name: 'ユーザー名', value: params.username, inline: true });
  if (params.userAgent) fields.push({ name: 'User-Agent', value: truncate(params.userAgent, 200) });

  void send('security', {
    title: 'レート制限超過',
    color: COLORS.orange,
    fields,
  });
}

export function notifyServerError(params: {
  method: string;
  url: string;
  statusCode: number;
  message: string;
  requestId?: string;
  userId?: number;
  stack?: string;
}): void {
  const fields: DiscordField[] = [
    { name: 'リクエスト', value: `${params.method} ${params.url}` },
    { name: 'ステータス', value: String(params.statusCode), inline: true },
  ];
  if (params.userId) fields.push({ name: 'User ID', value: String(params.userId), inline: true });
  if (params.requestId) fields.push({ name: 'Request ID', value: params.requestId, inline: true });
  if (params.stack)
    fields.push({ name: 'Stack', value: '```' + truncate(params.stack, 800) + '```' });

  void send('error', {
    title: 'サーバーエラー',
    description: truncate(params.message, 500),
    color: COLORS.red,
    fields,
  });
}

/**
 * プロセス終了前に届けたい通知なので、呼び出し側で await できるよう Promise を返す。
 */
export function notifyFatalProcessError(params: {
  reason: string;
  details: string;
}): Promise<void> {
  return send('error', {
    title: `プロセス異常終了: ${params.reason}`,
    description: '```' + truncate(params.details, 1500) + '```',
    color: COLORS.red,
  });
}

export function notifyRefreshTokenReuse(params: { userId: number }): void {
  void send('security', {
    title: 'リフレッシュトークン再利用検知',
    description:
      '失効済みリフレッシュトークンの再利用を検知したため、対象ユーザーの全トークンを失効させました。',
    color: COLORS.red,
    fields: [{ name: 'User ID', value: String(params.userId), inline: true }],
  });
}

export function notifyAdminAction(params: {
  action: string;
  by: { id: number; username: string };
  target?: string;
  details?: string;
}): void {
  const fields: DiscordField[] = [
    { name: '操作', value: params.action, inline: true },
    { name: '実行者', value: `${params.by.username} (#${params.by.id})`, inline: true },
  ];
  if (params.target) fields.push({ name: '対象', value: params.target });
  if (params.details) fields.push({ name: '詳細', value: truncate(params.details, 500) });

  void send('admin', {
    title: '管理者操作',
    color: COLORS.purple,
    fields,
  });
}

export function notifyBackupResult(params: {
  success: boolean;
  message?: string;
  sizeBytes?: number;
}): void {
  const fields: DiscordField[] = [];
  if (params.sizeBytes !== undefined) {
    fields.push({
      name: 'サイズ',
      value: `${(params.sizeBytes / 1024 / 1024).toFixed(2)} MB`,
      inline: true,
    });
  }
  if (params.message)
    fields.push({ name: '出力', value: '```' + truncate(params.message, 800) + '```' });

  void send('ops', {
    title: params.success ? 'DB バックアップ成功' : 'DB バックアップ失敗',
    color: params.success ? COLORS.green : COLORS.red,
    fields,
  });
}

export function notifyBroadcast(params: {
  broadcastId: number | bigint;
  title: string;
  preview: string;
  sender: { id: number; username: string };
}): void {
  void send('ops', {
    title: 'ブロードキャスト送信',
    description: truncate(params.preview, 500),
    color: COLORS.blue,
    fields: [
      { name: 'タイトル', value: params.title, inline: true },
      { name: 'ID', value: String(params.broadcastId), inline: true },
      { name: '送信者', value: `${params.sender.username} (#${params.sender.id})`, inline: true },
    ],
  });
}
