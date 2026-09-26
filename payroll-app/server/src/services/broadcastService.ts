/**
 * Broadcast Service - broadcast management with encryption
 */
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { sendPushToAll } from '../utils/push.js';
import { stripMarkdown } from '@payroll/shared/utils/markdown';
import { deleteUploadedFilesFromMessage } from '../utils/fileCleanup.js';
import { broadcastRepository } from '../repositories/broadcastRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { notifyBroadcast } from '../utils/discord.js';

export const broadcastService = {
  getAll(userId: number, isAdmin: boolean) {
    const rows = broadcastRepository.findAll(userId, isAdmin);
    return rows.map((row) => {
      const decoded = {
        ...row,
        send_push: Boolean(row.send_push),
        show_on_open: Boolean(row.show_on_open),
      };
      try {
        return { ...decoded, message: row.message ? decrypt(row.message) : row.message };
      } catch {
        return decoded; // Legacy plaintext
      }
    });
  },

  create(
    senderId: number,
    data: {
      message: string;
      title?: string;
      expiresAt?: string;
      category?: string;
      sendPush?: boolean;
      showOnOpen?: boolean;
    },
  ): number | bigint {
    const encryptedMessage = encrypt(data.message);
    if (encryptedMessage == null) {
      throw new Error('Encryption failed');
    }
    const title = data.title || 'お知らせ';
    const sendPush = data.sendPush !== false;
    const showOnOpen = data.showOnOpen === true;
    const id = broadcastRepository.create(
      senderId,
      title,
      encryptedMessage,
      data.expiresAt || null,
      data.category || 'general',
      sendPush,
      showOnOpen,
    );

    // Push notification (skipped when admin opted out)
    if (sendPush) {
      try {
        sendPushToAll(
          {
            title,
            body:
              stripMarkdown(data.message).substring(0, 50) +
              (data.message.length > 50 ? '...' : ''),
            // タップでお知らせページを開き、該当のお知らせを自動表示する
            url: `/announcements?broadcastId=${id}`,
            tag: 'broadcast',
          },
          senderId,
        );
      } catch (error) {
        logger.error(`Failed to send push notification: ${(error as Error).message}`);
      }
    }

    // クライアントは polling + Web Push で更新される（WebSocket 撤去済み）。
    // 全ワーカーの未読カウントキャッシュだけ無効化しておく。
    cache.invalidatePrefix('chat:unread:');

    try {
      const sender = userRepository.findById(senderId);
      notifyBroadcast({
        broadcastId: id,
        title,
        preview: stripMarkdown(data.message),
        sender: { id: senderId, username: sender?.username ?? '不明' },
      });
    } catch (err) {
      logger.warn(`Failed to notify broadcast on Discord: ${(err as Error).message}`);
    }

    return id;
  },

  delete(broadcastId: string | number): void {
    const row = broadcastRepository.findMessageById(broadcastId);

    // Soft-delete DB record first; only clean up files after the row is marked
    // deleted, so a failed delete doesn't leave broken file links behind.
    broadcastRepository.softDelete(broadcastId);

    if (row?.message) {
      let plainMessage: string;
      try {
        plainMessage = decrypt(row.message) ?? '';
      } catch {
        plainMessage = row.message;
      }
      deleteUploadedFilesFromMessage(plainMessage);
    }

    cache.invalidatePrefix('chat:unread:');
  },

  update(
    broadcastId: string | number,
    data: {
      message: string;
      title?: string;
      expiresAt?: string;
      category?: string;
      sendPush?: boolean;
      showOnOpen?: boolean;
    },
  ): number {
    const encryptedMessage = encrypt(data.message);
    if (encryptedMessage == null) {
      throw new Error('Encryption failed');
    }
    const title = data.title || null;
    const sendPush = data.sendPush !== false;
    const showOnOpen = data.showOnOpen === true;
    const changes = broadcastRepository.update(
      broadcastId,
      encryptedMessage,
      title,
      data.expiresAt || null,
      data.category || 'general',
      sendPush,
      showOnOpen,
    );

    if (changes === 0) return 0;

    // Reset read status
    try {
      broadcastRepository.resetReadStatus(broadcastId);
    } catch (err) {
      logger.error(`Failed to reset read status: ${(err as Error).message}`);
    }

    // Send update notification (skipped when admin opted out)
    if (sendPush) {
      try {
        const plainText = stripMarkdown(data.message).substring(0, 100);
        sendPushToAll({
          title: `【更新】${data.title || 'お知らせ'}`,
          body: plainText,
          url: `/announcements?broadcastId=${broadcastId}`,
          tag: `broadcast-update-${broadcastId}`,
        });
      } catch (error) {
        logger.error(`Failed to send update notification: ${(error as Error).message}`);
      }
    }

    cache.invalidatePrefix('chat:unread:');

    return changes;
  },

  markAsRead(userId: number, broadcastId: string | number): void {
    broadcastRepository.markAsRead(userId, broadcastId);
    // 未読カウントのキャッシュを無効化（次回 /unread で再計算）。WebSocket 撤去済み。
    cache.del(`chat:unread:${userId}`);
  },

  getReaders(broadcastId: string | number) {
    return broadcastRepository.getReaders(broadcastId);
  },

  /**
   * Unread counts for the current user. Chat was removed (G章), so `rooms` is
   * always 0; the shape `{ total, rooms, broadcasts }` is kept for backward
   * compatibility with the client and cached under the same `chat:unread:` key
   * that create/update/delete/markAsRead invalidate.
   */
  getUnreadCounts(userId: number): { total: number; rooms: number; broadcasts: number } {
    const cacheKey = `chat:unread:${userId}`;
    const cached = cache.get(cacheKey) as
      { total: number; rooms: number; broadcasts: number } | undefined;
    if (cached) return cached;

    const broadcasts = broadcastRepository.countUnread(userId);
    const payload = { total: broadcasts, rooms: 0, broadcasts };
    cache.set(cacheKey, payload, 10);
    return payload;
  },
};
