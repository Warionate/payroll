import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  default: { invalidatePrefix: vi.fn(), del: vi.fn(), invalidateUser: vi.fn() },
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  encrypt: vi.fn((v: unknown) => (v == null ? v : `enc_${v}`)),
  decrypt: vi.fn((v: unknown) => (v == null ? v : String(v).replace('enc_', ''))),
}));

vi.mock('../../../src/utils/push.js', () => ({
  sendPushToAll: vi.fn(),
}));

vi.mock('@payroll/shared/utils/markdown', () => ({
  stripMarkdown: vi.fn((s: string) => s),
}));

vi.mock('../../../src/utils/fileCleanup.js', () => ({
  deleteUploadedFilesFromMessage: vi.fn(),
}));

const { mockBroadcastRepository } = vi.hoisted(() => ({
  mockBroadcastRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    findMessageById: vi.fn(),
    softDelete: vi.fn(),
    update: vi.fn(),
    resetReadStatus: vi.fn(),
    markAsRead: vi.fn(),
    getReaders: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/broadcastRepository.js', () => ({
  broadcastRepository: mockBroadcastRepository,
}));

import { broadcastService } from '../../../src/services/broadcastService.js';
import cache from '../../../src/utils/cache.js';
import { deleteUploadedFilesFromMessage } from '../../../src/utils/fileCleanup.js';
import { sendPushToAll } from '../../../src/utils/push.js';

describe('broadcastService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return decrypted broadcasts', () => {
      mockBroadcastRepository.findAll.mockReturnValue([
        { id: 1, message: 'enc_Hello everyone', sender_id: 1, title: 'お知らせ' },
      ]);

      const result = broadcastService.getAll(1, false);

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Hello everyone');
    });

    it('should handle legacy plaintext messages gracefully', () => {
      mockBroadcastRepository.findAll.mockReturnValue([
        { id: 1, message: null, sender_id: 1, title: 'Empty' },
      ]);

      const result = broadcastService.getAll(1, true);

      expect(result[0].message).toBeNull();
    });

    it('should pass userId and isAdmin to repository', () => {
      mockBroadcastRepository.findAll.mockReturnValue([]);

      broadcastService.getAll(1, true);

      expect(mockBroadcastRepository.findAll).toHaveBeenCalledWith(1, true);
    });
  });

  describe('create', () => {
    it('should encrypt message and create broadcast', () => {
      mockBroadcastRepository.create.mockReturnValue(1);

      const result = broadcastService.create(1, {
        message: 'Important announcement',
        title: 'Notice',
      });

      expect(result).toBe(1);
      expect(mockBroadcastRepository.create).toHaveBeenCalledWith(
        1,
        'Notice',
        'enc_Important announcement',
        null,
        'general',
        true,
        false,
      );
    });

    it('should invalidate the unread-count cache after creation', () => {
      mockBroadcastRepository.create.mockReturnValue(5);

      broadcastService.create(1, { message: 'test' });

      expect(cache.invalidatePrefix).toHaveBeenCalledWith('chat:unread:');
    });

    it('should use default title when not provided', () => {
      mockBroadcastRepository.create.mockReturnValue(1);

      broadcastService.create(1, { message: 'test' });

      expect(mockBroadcastRepository.create).toHaveBeenCalledWith(
        1,
        'お知らせ',
        expect.any(String),
        null,
        'general',
        true,
        false,
      );
    });

    it('should use provided category', () => {
      mockBroadcastRepository.create.mockReturnValue(1);

      broadcastService.create(1, { message: 'test', category: 'urgent' });

      expect(mockBroadcastRepository.create).toHaveBeenCalledWith(
        1,
        'お知らせ',
        expect.any(String),
        null,
        'urgent',
        true,
        false,
      );
    });

    it('should skip push notification when sendPush is false', () => {
      mockBroadcastRepository.create.mockReturnValue(7);

      broadcastService.create(1, { message: 'silent', sendPush: false });

      expect(sendPushToAll).not.toHaveBeenCalled();
      expect(mockBroadcastRepository.create).toHaveBeenCalledWith(
        1,
        'お知らせ',
        expect.any(String),
        null,
        'general',
        false,
        false,
      );
    });

    it('should persist showOnOpen flag', () => {
      mockBroadcastRepository.create.mockReturnValue(8);

      broadcastService.create(1, { message: 'popup', showOnOpen: true });

      expect(mockBroadcastRepository.create).toHaveBeenCalledWith(
        1,
        'お知らせ',
        expect.any(String),
        null,
        'general',
        true,
        true,
      );
    });
  });

  describe('delete', () => {
    it('should soft delete broadcast and invalidate the unread-count cache', () => {
      mockBroadcastRepository.findMessageById.mockReturnValue({ message: 'enc_test' });

      broadcastService.delete(5);

      expect(mockBroadcastRepository.softDelete).toHaveBeenCalledWith(5);
      expect(cache.invalidatePrefix).toHaveBeenCalledWith('chat:unread:');
    });

    it('should attempt to clean up uploaded files from deleted message', () => {
      mockBroadcastRepository.findMessageById.mockReturnValue({ message: 'enc_check files' });

      broadcastService.delete(5);

      expect(deleteUploadedFilesFromMessage).toHaveBeenCalledWith('check files');
    });

    it('should handle broadcast with no message', () => {
      mockBroadcastRepository.findMessageById.mockReturnValue(null);

      broadcastService.delete(5);

      expect(deleteUploadedFilesFromMessage).not.toHaveBeenCalled();
      expect(mockBroadcastRepository.softDelete).toHaveBeenCalledWith(5);
    });
  });

  describe('update', () => {
    it('should encrypt and update broadcast', () => {
      mockBroadcastRepository.update.mockReturnValue(1);

      const changes = broadcastService.update(5, {
        message: 'Updated message',
        title: 'Updated Title',
      });

      expect(changes).toBe(1);
      expect(mockBroadcastRepository.update).toHaveBeenCalledWith(
        5,
        'enc_Updated message',
        'Updated Title',
        null,
        'general',
        true,
        false,
      );
    });

    it('should skip update push when sendPush is false', () => {
      mockBroadcastRepository.update.mockReturnValue(1);

      broadcastService.update(5, {
        message: 'silent update',
        title: 'X',
        sendPush: false,
      });

      expect(sendPushToAll).not.toHaveBeenCalled();
      expect(mockBroadcastRepository.update).toHaveBeenCalledWith(
        5,
        'enc_silent update',
        'X',
        null,
        'general',
        false,
        false,
      );
    });

    it('should reset read status after update', () => {
      mockBroadcastRepository.update.mockReturnValue(1);

      broadcastService.update(5, { message: 'updated' });

      expect(mockBroadcastRepository.resetReadStatus).toHaveBeenCalledWith(5);
    });

    it('should invalidate the unread-count cache after update', () => {
      mockBroadcastRepository.update.mockReturnValue(1);

      broadcastService.update(5, { message: 'updated', title: 'Test' });

      expect(cache.invalidatePrefix).toHaveBeenCalledWith('chat:unread:');
    });

    it('should return 0 and skip cache invalidation when no record updated', () => {
      mockBroadcastRepository.update.mockReturnValue(0);

      const changes = broadcastService.update(999, { message: 'test' });

      expect(changes).toBe(0);
      expect(cache.invalidatePrefix).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should mark broadcast as read and invalidate the user unread cache', () => {
      broadcastService.markAsRead(1, 5);

      expect(mockBroadcastRepository.markAsRead).toHaveBeenCalledWith(1, 5);
      expect(cache.del).toHaveBeenCalledWith('chat:unread:1');
    });
  });

  describe('getReaders', () => {
    it('should return readers from repository', () => {
      const mockReaders = [{ user_id: 1, username: 'user1', read_at: '2026-01-15' }];
      mockBroadcastRepository.getReaders.mockReturnValue(mockReaders);

      const result = broadcastService.getReaders(5);

      expect(result).toEqual(mockReaders);
    });
  });
});
