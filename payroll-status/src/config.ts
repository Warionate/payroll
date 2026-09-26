import 'dotenv/config';

/**
 * 数値の環境変数。未設定・空・数値でないときだけ既定値を使う。
 * `Number(x) || 既定値` だと `0` を指定しても既定値に戻ってしまう。
 */
function envNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const value = Number(raw);
  return Number.isFinite(value) ? value : defaultValue;
}

export const config = {
  // 未設定は production 扱い。開発時は .env の NODE_ENV=development で切り替える。
  // 既定を development にすると、NODE_ENV を付け忘れた本番起動で開発用の挙動
  // （0.0.0.0 への bind など）が有効になってしまう。
  nodeEnv: process.env.NODE_ENV || 'production',
  port: envNumber('PORT', 4002),

  // 監視対象
  payrollUrl: process.env.PAYROLL_URL || 'https://payroll.warionate.com',
  healthCheckIntervalMs: envNumber('HEALTH_CHECK_INTERVAL_MS', 30000),
  healthCheckTimeoutMs: envNumber('HEALTH_CHECK_TIMEOUT_MS', 10000),
  consecutiveFailuresThreshold: envNumber('CONSECUTIVE_FAILURES_THRESHOLD', 3),
  // 1回応答があっただけで復旧と判定すると、不安定な間は障害/復旧の投稿・通知が交互に出る
  recoverySuccessThreshold: envNumber('RECOVERY_SUCCESS_THRESHOLD', 2),
  // 単発のネットワークブリップを失敗としてカウントしないための即時リトライ。
  // 本当に落ちている場合は connection refused が即座に返るのでほぼ待たない。
  healthCheckRetries: envNumber('HEALTH_CHECK_RETRIES', 2),
  healthCheckRetryDelayMs: envNumber('HEALTH_CHECK_RETRY_DELAY_MS', 2000),
  // 全試行が失敗したときに、監視側（このサーバー）のネットワーク不調かどうかを
  // 見分けるための対照 URL。payroll-app と同じく Cloudflare 経由の経路にする。空文字で無効。
  healthCheckControlUrl:
    process.env.HEALTH_CHECK_CONTROL_URL ?? 'https://www.cloudflare.com/cdn-cgi/trace',

  // Discord
  discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
  discordGuildId: process.env.DISCORD_GUILD_ID || '',
  discordOwnerId: process.env.DISCORD_OWNER_ID || '',
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',

  // リダイレクト
  redirectUrl: process.env.REDIRECT_URL || 'https://payroll.warionate.com',

  // Cloudflare Access
  cfAccessTeamDomain: process.env.CF_ACCESS_TEAM_DOMAIN || '',
  cfAccessAud: process.env.CF_ACCESS_AUD || '',
  // 開発時のみ、localhost から直接開いた管理画面を Cloudflare Access なしで許可する
  adminDevBypass: process.env.ADMIN_DEV_BYPASS === 'true',
} as const;
