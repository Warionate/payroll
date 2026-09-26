import { db } from '../db/connection.js';
import { posts, settings } from '../db/schema.js';
import { and, eq, desc, notInArray } from 'drizzle-orm';
import { config } from '../config.js';
import { notifyPost } from './discord-webhook.js';
import type { NewPost, Post } from '../db/schema.js';

// --- Posts ---

/**
 * 「進行中」とみなさない status。
 * scheduled はメンテ予告など未来の予定で、投稿した瞬間に表示ステータスを
 * メンテ中にしたり、ヘルスチェックの障害通知を抑止したりしてはいけない。
 */
const INACTIVE_STATUSES = ['resolved', 'scheduled'];

export function isActivePost(post: Pick<Post, 'status'>): boolean {
  return !INACTIVE_STATUSES.includes(post.status);
}

export function createPost(data: Omit<NewPost, 'id' | 'createdAt' | 'updatedAt'>): Post {
  const result = db
    .insert(posts)
    .values({
      ...data,
      createdAt: Date.now(),
    })
    .returning()
    .get();
  return result;
}

export function updatePost(
  id: number,
  data: Partial<Pick<NewPost, 'type' | 'status' | 'title' | 'content'>>,
): Post | undefined {
  const result = db
    .update(posts)
    .set({
      ...data,
      updatedAt: Date.now(),
    })
    .where(eq(posts.id, id))
    .returning()
    .get();
  return result;
}

export function deletePost(id: number): boolean {
  const result = db.delete(posts).where(eq(posts.id, id)).run();
  return result.changes > 0;
}

export function getPost(id: number): Post | undefined {
  return db.select().from(posts).where(eq(posts.id, id)).get();
}

export function getRecentPosts(limit = 50): Post[] {
  return db.select().from(posts).orderBy(desc(posts.createdAt)).limit(limit).all();
}

/**
 * 進行中の投稿（新しい順）。表示用の getRecentPosts(50) と違い件数で切らないので、
 * 古い未解決の障害が新しい投稿に押し出されて判定から漏れることがない。
 */
export function getActivePosts(type?: string): Post[] {
  const active = notInArray(posts.status, INACTIVE_STATUSES);
  return db
    .select()
    .from(posts)
    .where(type ? and(active, eq(posts.type, type)) : active)
    .orderBy(desc(posts.createdAt))
    .all();
}

/**
 * health check の down→up 遷移で、自動作成した未解決の incident 投稿を
 * すべて解決済みにする。手動（admin/discord）で作成された incident は
 * オペレーターの判断なので触らない。これを行わないと computeAutoStatus が
 * 未解決 incident を見続けて status=incident のままになり、復旧しても
 * リダイレクトが自動再開しない。
 * @returns 解決した投稿数
 */
export function resolveAutoIncidents(): number {
  const active = getActivePosts('incident').filter((p) => p.source === 'auto');
  for (const post of active) {
    updatePost(post.id, { status: 'resolved' });
  }
  return active.length;
}

// --- Maintenance Mode ---

const MAINTENANCE_START_CONTENT = 'payroll.warionate.com はメンテナンスのため一時停止しています。';

/**
 * メンテナンスモードを切り替える admin API / Discord Bot 共通の入口。
 * 状態が実際に変わったときだけステータスフィードに履歴を残し、Discord に通知する:
 * ON で「メンテナンス開始」投稿を作成し、OFF で進行中のメンテ投稿をすべて
 * 解決済みにする（1件でも残ると computeAutoStatus がメンテ中と判定し続け、
 * 表示が戻らずリダイレクトも再開しない）。予定（scheduled）の投稿は残す。
 */
export function setMaintenanceMode(enabled: boolean): boolean {
  const current = getSetting('maintenance_mode') === 'true';
  if (current === enabled) return enabled;

  setSetting('maintenance_mode', String(enabled));

  if (enabled) {
    createPost({
      type: 'maintenance',
      status: 'none',
      title: 'メンテナンス開始',
      content: MAINTENANCE_START_CONTENT,
      source: 'auto',
    });
    void notifyPost('メンテナンス開始', MAINTENANCE_START_CONTENT, 'maintenance');
  } else {
    for (const post of getActivePosts('maintenance')) {
      updatePost(post.id, { status: 'resolved' });
    }
    void notifyPost(
      'メンテナンス終了',
      'payroll.warionate.com のメンテナンスが終了しました。',
      'resolved',
    );
  }
  return enabled;
}

// --- Settings ---

export function getSetting(key: string): string | undefined {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    })
    .run();
}

// --- Status Summary ---

export type StatusValue = 'operational' | 'incident' | 'maintenance';
export type StatusOverride = 'auto' | StatusValue;

export interface StatusSummary {
  status: StatusValue;
  statusOverride: StatusOverride;
  redirectEnabled: boolean;
  redirectActive: boolean;
  redirectUrl: string;
  maintenanceMode: boolean;
  lastHealthStatus: string;
  lastCheckAt: string;
  lastDownAt: string;
  recentPosts: Post[];
}

function computeAutoStatus(
  lastHealthStatus: string,
  maintenanceMode: boolean,
  activePosts: Post[],
): StatusValue {
  const activeIncident = activePosts.some((p) => p.type === 'incident');
  const activeMaintenance = activePosts.some((p) => p.type === 'maintenance');

  // メンテ中にサーバーを止めるとヘルスチェックは down になるが、それは想定内なので
  // health down より maintenance を優先する。明示的な incident 投稿だけはメンテより優先。
  if (activeIncident) return 'incident';
  if (maintenanceMode || activeMaintenance) return 'maintenance';
  if (lastHealthStatus === 'down') return 'incident';
  return 'operational';
}

/**
 * 計画停止中かどうか。health check はこの間のダウンを障害として投稿・通知しない。
 * メンテナンスモード ON・表示ステータスの手動メンテ固定・進行中のメンテ投稿のいずれか。
 */
export function isMaintenanceActive(): boolean {
  if (getSetting('maintenance_mode') === 'true') return true;
  if (getSetting('status_override') === 'maintenance') return true;
  return getActivePosts('maintenance').length > 0;
}

/**
 * 公開ページから本家へ転送するか。表示が稼働中でも、ヘルスチェックが応答なしの間は転送しない。
 * 手動で「稼働中」に固定したまま障害が起きると、Worker の障害ページとステータスページの
 * 間を閲覧者が行き来することになるため。
 */
export function isRedirectActive(
  redirectEnabled: boolean,
  status: StatusValue,
  lastHealthStatus: string,
): boolean {
  return redirectEnabled && status === 'operational' && lastHealthStatus !== 'down';
}

export function getEffectiveStatus(): StatusValue {
  const lastHealthStatus = getSetting('last_health_status') || 'unknown';
  const maintenanceMode = getSetting('maintenance_mode') === 'true';
  const override = (getSetting('status_override') || 'auto') as StatusOverride;
  if (override !== 'auto') return override;
  return computeAutoStatus(lastHealthStatus, maintenanceMode, getActivePosts());
}

export function getStatusSummary(): StatusSummary {
  const redirectEnabled = getSetting('redirect_enabled') === 'true';
  const maintenanceMode = getSetting('maintenance_mode') === 'true';
  const lastHealthStatus = getSetting('last_health_status') || 'unknown';
  const lastCheckAt = getSetting('last_check_at') || '';
  const lastDownAt = getSetting('last_down_at') || '';
  const override = (getSetting('status_override') || 'auto') as StatusOverride;
  const recentPosts = getRecentPosts(50);

  const autoStatus = computeAutoStatus(lastHealthStatus, maintenanceMode, getActivePosts());
  const status: StatusValue = override === 'auto' ? autoStatus : override;
  const redirectActive = isRedirectActive(redirectEnabled, status, lastHealthStatus);

  return {
    status,
    statusOverride: override,
    redirectEnabled,
    redirectActive,
    redirectUrl: config.redirectUrl,
    maintenanceMode,
    lastHealthStatus,
    lastCheckAt,
    lastDownAt,
    recentPosts,
  };
}
