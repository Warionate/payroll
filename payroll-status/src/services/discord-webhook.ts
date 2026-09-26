import { config } from '../config.js';

interface WebhookEmbed {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
}

// ヘルスチェックは送信完了を await するため、Discord 側が無応答でも
// チェックループを長時間ブロックしないようタイムアウトを設ける
const WEBHOOK_TIMEOUT_MS = 5000;

// Discord embed の上限。超えると Webhook 全体が 400 で拒否され、通知が黙って届かない
// （長い例外メッセージの致命的エラー通知や、Discord /post の長いタイトルで起きうる）。
const EMBED_LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, footer: 2048 };

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function fitEmbed(embed: WebhookEmbed): WebhookEmbed {
  return {
    ...embed,
    title: truncate(embed.title, EMBED_LIMITS.title),
    description: truncate(embed.description, EMBED_LIMITS.description),
    fields: embed.fields?.map((f) => ({
      ...f,
      name: truncate(f.name, EMBED_LIMITS.fieldName),
      value: truncate(f.value || '-', EMBED_LIMITS.fieldValue),
    })),
    footer: embed.footer && { text: truncate(embed.footer.text, EMBED_LIMITS.footer) },
  };
}

async function sendWebhook(embeds: WebhookEmbed[]): Promise<void> {
  if (!config.discordWebhookUrl) {
    console.warn('[Discord Webhook] URL not configured, skipping notification');
    return;
  }

  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Payroll Status',
        embeds: embeds.map(fitEmbed),
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[Discord Webhook] Failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('[Discord Webhook] Error:', (err as Error).message);
  }
}

const nowJst = () => new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

function formatMinutes(minutes: number): string {
  if (minutes < 1) return '1分未満';
  if (minutes < 60) return `約${Math.round(minutes)}分`;
  return `約${Math.floor(minutes / 60)}時間${Math.round(minutes % 60)}分`;
}

/** 運用上の注意（手動固定の戻し忘れ・未解決の障害など）を embed のフィールドにする */
function noteFields(notes: string[] = []): { name: string; value: string }[] {
  return notes.map((value) => ({ name: '⚠️ 確認してください', value }));
}

interface NotifyOptions {
  notes?: string[];
}

export async function notifyDown(options: NotifyOptions = {}): Promise<void> {
  await sendWebhook([
    {
      title: '🔴 障害検知 — payroll.warionate.com',
      description: `**payroll.warionate.com** がダウンしています。\nステータスページに自動投稿しました。`,
      color: 0xef4444, // red
      fields: [
        { name: '検知時刻', value: nowJst(), inline: true },
        {
          name: 'ステータスページ',
          value: 'https://payroll-status.warionate.com',
          inline: true,
        },
        ...noteFields(options.notes),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Payroll Status Monitor' },
    },
  ]);
}

export async function notifyUp(downtimeMinutes: number, options: NotifyOptions = {}): Promise<void> {
  await sendWebhook([
    {
      title: '🟢 復旧確認 — payroll.warionate.com',
      description: `**payroll.warionate.com** が復旧しました。`,
      color: 0x22c55e, // green
      fields: [
        { name: '復旧時刻', value: nowJst(), inline: true },
        { name: 'ダウンタイム', value: formatMinutes(downtimeMinutes), inline: true },
        ...noteFields(options.notes),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Payroll Status Monitor' },
    },
  ]);
}

/**
 * メンテ中のダウン（計画停止）。公開フィードには投稿しないが、
 * 手動固定の戻し忘れなどで本当の障害が黙殺されないよう、運用者には控えめに知らせる。
 */
export async function notifyPlannedDown(reason: string, options: NotifyOptions = {}): Promise<void> {
  await sendWebhook([
    {
      title: '🔧 計画停止を検知 — payroll.warionate.com',
      description: [
        'メンテナンス中のため、ステータスページへの障害投稿は行っていません。',
        'メンテナンスを終えても応答がなければ、その時点で障害として投稿・通知します。',
      ].join('\n'),
      color: 0x6b7280, // gray
      fields: [
        { name: '検知時刻', value: nowJst(), inline: true },
        { name: '理由', value: reason, inline: true },
        ...noteFields(options.notes),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Payroll Status Monitor' },
    },
  ]);
}

export async function notifyPlannedUp(maintenanceStillOn: boolean): Promise<void> {
  await sendWebhook([
    {
      title: '🔧 計画停止から応答が戻りました — payroll.warionate.com',
      description: maintenanceStillOn
        ? 'メンテナンスモードは ON のままです。作業が終わったら OFF にしてください。'
        : 'payroll.warionate.com が応答しています。',
      color: 0x6b7280, // gray
      fields: [{ name: '確認時刻', value: nowJst(), inline: true }],
      timestamp: new Date().toISOString(),
      footer: { text: 'Payroll Status Monitor' },
    },
  ]);
}

/**
 * 起動時、前回のヘルスチェックから大きく間が空いていたときの通知。
 * 例外で落ちたときは notifyFatalError が出るが、メモリ不足での強制終了・
 * サーバー再起動・PM2 の再起動打ち切りでは何も出ないため、再開時にだけでも知らせる。
 */
export async function notifyMonitorResumed(gapMinutes: number): Promise<void> {
  await sendWebhook([
    {
      title: '👀 監視を再開 — payroll-status',
      description: [
        `前回のヘルスチェックから${formatMinutes(gapMinutes)}空いていました。`,
        'この間は payroll-app の障害を検知・通知できていません（プロセス停止・サーバー再起動の可能性）。',
      ].join('\n'),
      color: 0xf59e0b, // amber
      fields: [{ name: '再開時刻', value: nowJst(), inline: true }],
      timestamp: new Date().toISOString(),
      footer: { text: 'Payroll Status Monitor' },
    },
  ]);
}

export async function notifyPost(
  title: string,
  content: string,
  type: string,
): Promise<void> {
  const colorMap: Record<string, number> = {
    incident: 0xef4444,
    maintenance: 0xeab308,
    update: 0x3b82f6,
    resolved: 0x22c55e,
  };

  await sendWebhook([
    {
      title: `📢 ${title}`,
      description: content.length > 2000 ? content.slice(0, 2000) + '...' : content,
      color: colorMap[type] || 0x6b7280,
      timestamp: new Date().toISOString(),
      footer: { text: 'Payroll Status Page' },
    },
  ]);
}

/**
 * 捕捉されなかった例外 / Promise 拒否をプロセス終了前に通知する。
 *
 * notifyDown は「payroll-app のダウン」を表すので、こちらとは意味を分ける
 * （このアプリ自身の死は、障害検知の担い手が消えることを意味する）。
 */
export async function notifyFatalError(params: {
  reason: string;
  details?: string;
}): Promise<void> {
  const details = params.details
    ? params.details.length > 1000
      ? params.details.slice(0, 1000) + '...'
      : params.details
    : 'なし';

  await sendWebhook([
    {
      title: '💥 致命的エラー — payroll-status (監視プロセス)',
      description: [
        '**payroll-status が捕捉されない例外で停止します。**',
        'このプロセスは payroll-app の障害検知を担っているため、再起動に失敗している場合は障害通知が届かなくなります。',
      ].join('\n'),
      color: 0xdc2626,
      fields: [
        { name: '発生時刻', value: nowJst(), inline: true },
        { name: '理由', value: params.reason, inline: true },
        // コードブロックの閉じ記号が切り詰めで欠けないよう、中身だけを先に詰める
        { name: '詳細', value: ['```', truncate(details, EMBED_LIMITS.fieldValue - 8), '```'].join('\n') },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Payroll Status Monitor' },
    },
  ]);
}
