/**
 * User Service - user management business logic
 */
import bcrypt from 'bcrypt';
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

export const userService = {
  /**
   * Get all users (admin only)
   */
  getAll() {
    const rows = userRepository.findAll();
    logger.info(`Fetched ${rows.length} users`);
    return rows;
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
      const valid = await bcrypt.compare(password, user.password_hash);
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
   * Update user's display name
   */
  updateProfile(
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
      throw new AuthorizationError('メイン管理者のユーザー名は変更できません');
    }
    // ログイン欄はユーザー名とメールアドレスの両方を受けるので、誰かの確認済みアドレスと
    // 同じ文字列のユーザー名は作らせない（ログインが別の人に向かうのを防ぐ）
    const emailOwner = userRepository.findByEmail(username);
    if (emailOwner && emailOwner.id !== userId) {
      throw new ValidationError('このユーザー名は使えません');
    }

    userRepository.updateUsername(userId, username);

    if (requestUser.id !== userId) {
      notifyAdminAction({
        action: 'ユーザー名変更',
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
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) {
        throw new AuthenticationError('現在のパスワードが間違っています');
      }
    }

    const hash = await bcrypt.hash(password, 10);
    userRepository.updatePassword(userId, hash);
    authService.revokeAllUserTokens(userId);

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
    notifyAdminAction({
      action: 'ロール変更',
      by: { id: requestUser.id, username: requestUser.username },
      target: `${user.username} (#${userId})`,
      details: `${user.role} → ${role}`,
    });
  },
};
