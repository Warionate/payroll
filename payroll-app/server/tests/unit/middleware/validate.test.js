import { describe, it, expect } from 'vitest';
import {
  loginValidation,
  registerValidation,
  idParamValidation,
  chatMessageValidation,
  announcementValidation,
  broadcastValidation,
  workLogQueryValidation,
} from '../../../src/middleware/validate.js';
import { BROADCAST_CATEGORIES } from '@payroll/shared';

// Test Zod validation schemas directly

describe('validation schemas (Zod)', () => {
  describe('loginValidation', () => {
    it('username should be required and not empty', () => {
      const result = loginValidation.safeParse({ username: '', password: 'pass' });
      expect(result.success).toBe(false);
    });

    it('username should pass with valid value', () => {
      const result = loginValidation.safeParse({ username: 'testuser', password: 'pass' });
      expect(result.success).toBe(true);
    });

    it('password should be required', () => {
      const result = loginValidation.safeParse({ username: 'testuser', password: '' });
      expect(result.success).toBe(false);
    });

    it('password should pass with valid value', () => {
      const result = loginValidation.safeParse({ username: 'testuser', password: 'password123' });
      expect(result.success).toBe(true);
    });
  });

  describe('registerValidation', () => {
    it('username should require minimum 3 characters', () => {
      const result = registerValidation.safeParse({ username: 'ab', password: 'Passw0rd!' });
      expect(result.success).toBe(false);
    });

    it('username should pass with 3+ characters', () => {
      const result = registerValidation.safeParse({ username: 'abc', password: 'Passw0rd!' });
      expect(result.success).toBe(true);
    });

    it('password should require minimum 8 characters', () => {
      const result = registerValidation.safeParse({ username: 'testuser', password: 'Pa1!' });
      expect(result.success).toBe(false);
    });

    it('password should pass with valid password', () => {
      const result = registerValidation.safeParse({ username: 'testuser', password: 'Passw0rd!' });
      expect(result.success).toBe(true);
    });

    it('password should not contain username', () => {
      const result = registerValidation.safeParse({
        username: 'testuser',
        password: 'testuser1A!',
      });
      expect(result.success).toBe(false);
    });

    it('password should not be a common password', () => {
      const result = registerValidation.safeParse({ username: 'testuser', password: 'password' });
      expect(result.success).toBe(false);
    });
  });

  describe('idParamValidation', () => {
    it('id should be numeric', () => {
      const result = idParamValidation.safeParse({ id: 'abc' });
      expect(result.success).toBe(false);
    });

    it('id should be positive', () => {
      const result = idParamValidation.safeParse({ id: '0' });
      expect(result.success).toBe(false);
    });

    it('id should pass with valid positive integer', () => {
      const result = idParamValidation.safeParse({ id: '123' });
      expect(result.success).toBe(true);
    });
  });

  describe('chatMessageValidation', () => {
    it('message should not be empty', () => {
      const result = chatMessageValidation.safeParse({ message: '' });
      expect(result.success).toBe(false);
    });

    it('message should pass with valid content', () => {
      const result = chatMessageValidation.safeParse({ message: 'Hello world' });
      expect(result.success).toBe(true);
    });
  });

  describe('announcementValidation', () => {
    it('title should not be empty', () => {
      const result = announcementValidation.safeParse({ title: '', content: 'Test content' });
      expect(result.success).toBe(false);
    });

    it('title should pass with valid content', () => {
      const result = announcementValidation.safeParse({
        title: 'Test Title',
        content: 'Test content',
      });
      expect(result.success).toBe(true);
    });

    it('content should not be empty', () => {
      const result = announcementValidation.safeParse({ title: 'Test', content: '' });
      expect(result.success).toBe(false);
    });

    it('content should pass with valid content', () => {
      const result = announcementValidation.safeParse({
        title: 'Test',
        content: 'Test content here',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('broadcastValidation', () => {
    // 管理画面のお知らせフォームが送るカテゴリ（お知らせ/重要/メンテ/イベント）が
    // すべて受理されることを担保する。サーバーの enum が UI とずれると
    // 「重要」「メンテ」「イベント」を選んだ送信が 400 で弾かれる回帰になる。
    it.each(BROADCAST_CATEGORIES)('should accept the "%s" category', (category) => {
      const result = broadcastValidation.safeParse({ message: 'hello', category });
      expect(result.success).toBe(true);
    });

    it('should expose the full category set used by the client UI', () => {
      expect([...BROADCAST_CATEGORIES]).toEqual(['general', 'important', 'maintenance', 'event']);
    });

    it('should reject an unknown category', () => {
      const result = broadcastValidation.safeParse({ message: 'hello', category: 'urgent' });
      expect(result.success).toBe(false);
    });

    it('should allow omitting the category (defaults applied downstream)', () => {
      const result = broadcastValidation.safeParse({ message: 'hello' });
      expect(result.success).toBe(true);
    });
  });

  describe('workLogQueryValidation', () => {
    it('start_date and end_date should be required', () => {
      expect(workLogQueryValidation.safeParse({}).success).toBe(false);
      expect(workLogQueryValidation.safeParse({ start_date: '2026-01-01' }).success).toBe(false);
    });

    it('should reject malformed dates', () => {
      const result = workLogQueryValidation.safeParse({
        start_date: '2026-13-40',
        end_date: '2026-12-15',
      });
      expect(result.success).toBe(false);
    });

    it('start_date must not be after end_date', () => {
      const result = workLogQueryValidation.safeParse({
        start_date: '2026-12-16',
        end_date: '2026-12-15',
      });
      expect(result.success).toBe(false);
    });

    // 給与履歴画面（SalaryHistory.tsx）は前年12/1〜当年12/15を取得するため、
    // 上限が短すぎると履歴が全月¥0になる回帰が起きる（v8.0.67 で 366日上限が
    // 379日の取得範囲を弾いた実績あり）。うるう年隣接の過去年は最大380日に
    // なるため、その範囲が受理されることを担保する。
    it('should accept the widest range the salary history screen requests', () => {
      // 過去年（うるう年 2024 を含む）: 2023-12-01 〜 2024-12-15 = 380日
      const result = workLogQueryValidation.safeParse({
        start_date: '2023-12-01',
        end_date: '2024-12-15',
      });
      expect(result.success).toBe(true);
    });

    it('should reject ranges that exceed the 400-day cap', () => {
      const result = workLogQueryValidation.safeParse({
        start_date: '2025-01-01',
        end_date: '2026-03-01', // 424日 > 400
      });
      expect(result.success).toBe(false);
    });
  });
});
