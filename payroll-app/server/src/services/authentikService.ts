/**
 * Authentik Service - Authentik の管理者グループ（payroll-admin）のメンバーシップを読み書きする
 *
 * role の正は Authentik。アプリ側で role を変えるときは先にここで Authentik に書き、
 * 成功したときだけ DB に書く（userService.updateRole）。
 *
 * 使うトークンは「管理者グループの閲覧・メンバー追加・メンバー削除」だけに権限を絞った
 * サービスアカウントのもの。利用者一覧や他のグループは読めない。
 * そのため利用者の特定は OIDC の sub（プロバイダの sub_mode = user_id なので Authentik の pk）で行う。
 */
import logger from '../utils/logger.js';

const TIMEOUT_MS = 5000;

function config() {
  const url = process.env.AUTHENTIK_URL;
  const token = process.env.AUTHENTIK_API_TOKEN;
  const group = process.env.AUTHENTIK_ADMIN_GROUP; // グループの UUID
  if (!url || !token || !group) return null;
  return { base: url.replace(/\/+$/, ''), token, group };
}

function toPk(sub: string): number {
  const pk = Number(sub);
  if (!Number.isInteger(pk) || pk <= 0) {
    // sub_mode が user_id 以外（hashed_user_id 等）だと数値にならない。プロバイダ設定の誤り
    throw new Error(`OIDC sub is not an Authentik user id: ${sub}`);
  }
  return pk;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const c = config()!;
  const res = await fetch(`${c.base}/api/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Authentik API ${init.method ?? 'GET'} ${path} -> HTTP ${res.status}`);
  }
  return res;
}

export const authentikService = {
  isConfigured(): boolean {
    return config() !== null;
  },

  /**
   * 管理者グループに入っているか。Authentik に届かないときは null（呼び出し側は DB の role を据え置く）
   */
  async isAdmin(sub: string): Promise<boolean | null> {
    if (!config()) return null;
    try {
      const pk = toPk(sub);
      const res = await call(`/core/groups/${config()!.group}/`);
      const body = (await res.json()) as { users?: number[] };
      return Array.isArray(body.users) && body.users.includes(pk);
    } catch (err) {
      logger.warn('Authentik group lookup failed; keeping DB role', {
        error: (err as Error).message,
      });
      return null;
    }
  },

  /**
   * 管理者グループへの追加・削除。失敗したら例外（呼び出し側は DB を書き換えない）
   */
  async setAdmin(sub: string, admin: boolean): Promise<void> {
    if (!config()) throw new Error('Authentik is not configured');
    const pk = toPk(sub);
    await call(`/core/groups/${config()!.group}/${admin ? 'add_user' : 'remove_user'}/`, {
      method: 'POST',
      body: JSON.stringify({ pk }),
    });
    logger.info(`Authentik admin group ${admin ? 'add' : 'remove'}: pk=${pk}`);
  },
};
