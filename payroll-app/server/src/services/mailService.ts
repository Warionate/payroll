/**
 * Mail Service - メールの送信（SMTP）
 *
 * 送り元は mailcow のローカル認証のアカウント（本番 noreply@payroll.warionate.com）。
 * Authentik 経由にしないのは、Authentik 障害でメールまで止まる循環を避けるため。
 *
 * .env に SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM / APP_URL が無ければ機能ごと無効。
 */
import nodemailer, { type Transporter } from 'nodemailer';
import logger from '../utils/logger.js';

function settings() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;
  const appUrl = process.env.APP_URL;
  if (!host || !user || !pass || !from || !appUrl) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    user,
    pass,
    from,
    appUrl: appUrl.replace(/\/+$/, ''),
  };
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  const s = settings()!;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465,
      requireTLS: s.port !== 465, // 587 では STARTTLS を必須にする（平文で認証情報を送らない）
      auth: { user: s.user, pass: s.pass },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

export const mailService = {
  isEnabled(): boolean {
    return settings() !== null;
  },

  /** メール内のリンクの起点（例: https://payroll.warionate.com） */
  appUrl(): string {
    return settings()!.appUrl;
  },

  async send(to: string, subject: string, text: string): Promise<void> {
    const s = settings()!;
    await getTransporter().sendMail({ from: s.from, to, subject, text });
    logger.info(`Mail sent: "${subject}"`);
  },
};
