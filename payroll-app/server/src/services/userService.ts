/**
 * User Service - user management business logic
 */
import logger from '../utils/logger.js';
import { userRepository } from '../repositories/userRepository.js';
import { authService } from './authService.js';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ErrorCodes,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { notifyAdminAction } from '../utils/discord.js';
import { authentikService } from './authentikService.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { recordSecurityEvent } from '../utils/securityLog.js';
import { mfaService } from './mfaService.js';
import { sendAccountNotice } from '../utils/accountNotice.js';
import { alertAdminGranted } from '../utils/securityAlerts.js';
import { mfaRepository } from '../repositories/mfaRepository.js';
import { webauthnRepository } from '../repositories/webauthnRepository.js';

export const userService = {
  /**
   * Get all users (admin only)
   */
  getAll() {
    const rows = userRepository.findAll();
    logger.info(`Fetched ${rows.length} users`);
    // 管理画面で「最初の設定がまだ」の人を見分けられるように、済んでいない項目を付ける
    return rows.map((row) => ({
      ...row,
      setup: mfaService.setupStatus(userRepository.findById(row.id)),
    }));
  },

  /**
   * 管理者が、利用者の二段階認証の手段（パスキー・認証アプリと回復コード・Authentik 連携）をすべて外す。
   * 端末を失くして回復コードも無い人のための最後の手段。外した人は全端末からログアウトさせ、
   * 次にパスワードでログインしたときに最初の設定（二段階の登録）に戻る。
   * 管理者は対象外（二段階なしでは管理者はパスワードでログインできず、締め出されるため。非常口は OPERATIONS.md）
   */
  resetMfa(userId: number, requestUser: { id: number; username: string; role: string }): void {
    if (requestUser.role !== 'admin') throw new AuthorizationError();
    if (requestUser.id === userId) {
      throw new ValidationError(
        '自分の二段階認証はリセットできません。設定画面から変更してください',
      );
    }
    const user = userRepository.findById(userId);
    if (!user) throw new NotFoundError('ユーザー');
    if (user.role === 'admin' || user.username === 'admin') {
      throw new ValidationError(
        '管理者の二段階認証はリセットできません（リセットするとログインできなくなります）',
      );
    }

    const passkeys = webauthnRepository.deleteAllForUser(userId);
    mfaRepository.disableTotp(userId);
    userRepository.setOidcSub(userId, null);
    authService.revokeAllUserTokens(userId);

    recordSecurityEvent(userId, 'mfa_reset', {}, `by admin ${requestUser.username}`);
    sendAccountNotice(user, 'mfa_reset');
    logger.warn(`MFA reset by admin: ${user.username} (#${userId}), passkeys removed: ${passkeys}`);
    notifyAdminAction({
      action: '二段階認証のリセット',
      by: { id: requestUser.id, username: requestUser.username },
      target: `${user.username} (#${userId})`,
      details: `パスキー ${passkeys} 件・認証アプリ・Authentik 連携を外し、全端末をログアウト`,
    });
  },

  /**
   * 新規登録のあと、期限（7 日）までに最初の設定を済ませなかったアカウントを消す。
   * 期限を過ぎていても設定が済んでいれば期限を外すだけ。管理者・メイン管理者は消さない。
   * 期限はこの仕組みのあとに新規登録した人にだけ付く（それより前からの利用者は対象外）。
   * 消した数を返す
   */
  cleanupIncompleteSignups(now = new Date()): number {
    if (!mfaService.enforced()) return 0;
    let deleted = 0;
    for (const user of userRepository.findPastSetupDeadline(now.toISOString())) {
      const setup = mfaService.setupStatus(user);
      if (!setup.email && !setup.mfa && !setup.loginId) {
        userRepository.setSetupDeadline(user.id, null);
        continue;
      }
      if (user.role === 'admin' || user.username === 'admin') {
        userRepository.setSetupDeadline(user.id, null);
        continue;
      }
      userRepository.deleteWithCascade(user.id);
      deleted++;
      logger.info(`Deleted account that did not finish setup: ${user.username} (#${user.id})`);
      notifyAdminAction({
        action: '最初の設定が済まなかったアカウントの自動削除',
        by: { id: 0, username: 'system' },
        target: `${user.username} (#${user.id})`,
        details: `期限 ${user.setup_deadline}`,
      });
    }
    return deleted;
  },

  /**
   * Delete a user with all related data.
   *
   * Self-deletion requires the caller to re-confirm their password — admins
   * deleting other users do not need to supply one.
   */
  async deleteUser(
    userId: number,
    requestUser: { id: number; username: string; role: string },
    password?: string,
  ): Promise<void> {
    if (requestUser.role !== 'admin' && requestUser.id !== userId) {
      throw new AuthorizationError();
    }

    const user = userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('ユーザー');
    }
    if (user.username === 'admin') {
      throw new AuthorizationError('メイン管理者ユーザーは削除できません');
    }

    if (requestUser.id === userId) {
      if (!password) {
        throw new ValidationError('パスワードを入力してください', { field: 'password' });
      }
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        throw new AuthenticationError('パスワードが間違っています');
      }
    }

    userRepository.deleteWithCascade(userId);
    logger.info(`User deleted: ${user.username} (ID: ${userId})`);
    notifyAdminAction({
      action: 'ユーザー削除',
      by: { id: requestUser.id, username: requestUser.username },
      target: `${user.username} (#${userId})`,
    });
  },

  /**
   * 表示名を変える（本人か管理者）
   */
  updateDisplayName(
    userId: number,
    displayName: string,
    requestUser: { id: number; username: string; role: string },
  ): void {
    if (requestUser.role !== 'admin' && requestUser.id !== userId) {
      throw new AuthorizationError();
    }
    if (!userRepository.findById(userId)) {
      throw new NotFoundError('ユーザー');
    }
    userRepository.updateDisplayName(userId, displayName);
  },

  /**
   * ユーザー ID（ログインに使う）を変える（本人か管理者）
   */
  updateLoginId(
    userId: number,
    username: string,
    requestUser: { id: number; username: string; role: string },
  ): void {
    if (requestUser.role !== 'admin' && requestUser.id !== userId) {
      throw new AuthorizationError();
    }

    const user = userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('ユーザー');
    }
    if (user.username === 'admin') {
      throw new AuthorizationError('メイン管理者のユーザーIDは変更できません');
    }
    // ログイン欄はユーザー名とメールアドレスの両方を受けるので、誰かの確認済みアドレスと
    // 同じ文字列のユーザー名は作らせない（ログインが別の人に向かうのを防ぐ）
    const emailOwner = userRepository.findByEmail(username);
    if (emailOwner && emailOwner.id !== userId) {
      throw new ValidationError('このユーザー名は使えません');
    }

    const owner = userRepository.findByUsername(username);
    if (owner && owner.id !== userId) {
      throw new ValidationError('このユーザーIDは既に使われています', { field: 'username' });
    }

    userRepository.updateUsername(userId, username);
    recordSecurityEvent(userId, 'login_id_changed', {}, `${user.username} -> ${username}`);

    if (requestUser.id !== userId) {
      notifyAdminAction({
        action: 'ユーザーID変更',
        by: { id: requestUser.id, username: requestUser.username },
        target: `${user.username} (#${userId})`,
        details: `${user.username} → ${username}`,
      });
    }
  },

  /**
   * Update user's password (revokes all refresh tokens).
   * Self-update requires currentPassword re-confirmation.
   */
  async updatePassword(
    userId: number,
    password: string,
    requestUser: { id: number; username: string; role: string },
    currentPassword?: string,
  ): Promise<void> {
    if (requestUser.role !== 'admin' && requestUser.id !== userId) {
      throw new AuthorizationError();
    }

    const user = userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('ユーザー');
    }

    if (requestUser.id === userId) {
      if (!currentPassword) {
        throw new ValidationError('現在のパスワードを入力してください', {
          field: 'currentPassword',
        });
      }
      const valid = await verifyPassword(currentPassword, user.password_hash);
      if (!valid) {
        throw new AuthenticationError('現在のパスワードが間違っています');
      }
    }

    await authService.assertNotPwned(password);
    const hash = await hashPassword(password);
    userRepository.updatePassword(userId, hash);
    authService.revokeAllUserTokens(userId);
    recordSecurityEvent(
      userId,
      'password_changed',
      {},
      requestUser.id === userId ? undefined : `by admin ${requestUser.username}`,
    );
    sendAccountNotice(
      user,
      requestUser.id === userId ? 'password_changed' : 'password_set_by_admin',
    );

    if (requestUser.id !== userId) {
      notifyAdminAction({
        action: 'パスワードリセット',
        by: { id: requestUser.id, username: requestUser.username },
        target: `${user.username} (#${userId})`,
      });
    }
  },

  /**
   * Update user's role (admin only)
   */
  async updateRole(
    userId: number,
    role: string,
    requestUser: { id: number; username: string; role: string },
  ): Promise<void> {
    if (!['admin', 'user'].includes(role)) {
      throw new ValidationError('無効な権限です', { field: 'role', valid: ['admin', 'user'] });
    }

    const user = userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('ユーザー');
    }
    if (user.username === 'admin') {
      throw new AuthorizationError('メイン管理者の権限は変更できません');
    }

    // Authentik と連携済みなら role の正は Authentik。先に Authentik に書き、成功したときだけ DB に書く
    if (user.oidc_sub && authentikService.isConfigured()) {
      try {
        await authentikService.setAdmin(user.oidc_sub, role === 'admin');
      } catch (err) {
        logger.error('Failed to update Authentik admin group; role not changed', {
          userId,
          error: (err as Error).message,
        });
        throw new AppError(
          'Authentik に反映できなかったため、権限を変更しませんでした',
          502,
          ErrorCodes.SERVICE_UNAVAILABLE,
        );
      }
    }

    userRepository.updateRole(userId, role);
    recordSecurityEvent(
      userId,
      'role_changed',
      {},
      `${user.role} -> ${role} by ${requestUser.username}`,
    );
    if (role === 'admin') alertAdminGranted(user, `管理画面（${requestUser.username}）`);
    notifyAdminAction({
      action: 'ロール変更',
      by: { id: requestUser.id, username: requestUser.username },
      target: `${user.username} (#${userId})`,
      details: `${user.role} → ${role}`,
    });
  },
};
