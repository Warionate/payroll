import {
  createPost,
  getActivePosts,
  getPost,
  isActivePost,
  setSetting,
  updatePost,
} from './post.js';
import { notifyPost } from './discord-webhook.js';
import type { Post } from '../db/schema.js';

export type PostSource = 'admin' | 'discord';

interface SubmitInput {
  type: string;
  status?: string | null;
  title: string;
  content: string;
  source: PostSource;
}

const defaultStatusByType: Record<string, string> = {
  incident: 'investigating',
  maintenance: 'monitoring',
  update: 'resolved',
  resolved: 'resolved',
};

/**
 * Admin・Discord 両方から呼ばれる共通の投稿処理。
 * ステータス自動判定・リダイレクト自動OFF・Webhook通知を一元化する。
 *
 * Webhook 通知は fire-and-forget。Discord interaction は 3 秒以内の応答が必須で、
 * Webhook の完了を待つと応答期限を超えるおそれがあるため、ここでは待たない
 * （notifyPost は内部でエラーを握りつぶすので未処理 rejection にはならない）。
 */
export function submitPost(input: SubmitInput): Post {
  const status = input.status || defaultStatusByType[input.type] || 'investigating';

  const post = createPost({
    type: input.type,
    status,
    title: input.title,
    content: input.content,
    source: input.source,
  });

  // 進行中の障害/メンテのときだけリダイレクトを止める。解決済みの事後報告や
  // メンテ予告（scheduled）で本家への転送を止める理由はない。
  if ((input.type === 'incident' || input.type === 'maintenance') && isActivePost(post)) {
    setSetting('redirect_enabled', 'false');
    // 障害/メンテ投稿による OFF はオペレーターの意思。health check の
    // down→up 遷移で勝手に ON へ戻さない（解決操作で明示的に ON に戻す）。
    setSetting('redirect_auto_disabled', 'false');
  }

  void notifyPost(input.title, input.content, input.type);

  return post;
}

interface ResolveInput {
  /** 省略時は最新の未解決 incident */
  id?: number | null;
  /** 指定すると「復旧」投稿を作成して Discord に通知する */
  message?: string | null;
  resumeRedirect: boolean;
  source: PostSource;
}

export type ResolveResult =
  | { ok: true; incident: Post; recoveryPost: Post | null }
  | { ok: false; code: 'not_found' | 'invalid'; error: string };

/**
 * 障害を解決する Admin・Discord 共通の入口。
 * 「復旧」投稿を新しく作るだけでは元の incident が未解決のまま残り、
 * 表示ステータスが障害発生中から戻らないため、incident 自体の status を解決済みにする。
 * type は変えない（公開フィードに障害の記録を残す）。
 */
export function resolveIncident(input: ResolveInput): ResolveResult {
  const incident = input.id != null ? getPost(input.id) : getActivePosts('incident')[0];

  if (!incident) {
    return input.id != null
      ? { ok: false, code: 'not_found', error: `投稿 #${input.id} が見つかりません` }
      : { ok: false, code: 'not_found', error: '未解決の障害がありません' };
  }
  if (incident.type !== 'incident') {
    return { ok: false, code: 'invalid', error: `投稿 #${incident.id} は障害の投稿ではありません` };
  }
  if (!isActivePost(incident)) {
    return { ok: false, code: 'invalid', error: `投稿 #${incident.id} はすでに解決済みです` };
  }

  const updated = updatePost(incident.id, { status: 'resolved' }) ?? incident;

  const message = input.message?.trim();
  const recoveryPost = message
    ? submitPost({
        type: 'resolved',
        status: 'resolved',
        title: `復旧: ${incident.title}`,
        content: message,
        source: input.source,
      })
    : null;

  if (input.resumeRedirect) {
    setSetting('redirect_enabled', 'true');
    setSetting('redirect_auto_disabled', 'false');
  }

  return { ok: true, incident: updated, recoveryPost };
}
