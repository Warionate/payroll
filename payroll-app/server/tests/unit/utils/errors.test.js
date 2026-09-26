import { describe, it, expect, vi, beforeAll } from 'vitest';

// Set required env vars before importing
beforeAll(() => {
  process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
  process.env.JWT_SECRET = '12345678901234567890123456789012';
});

describe('error utilities', () => {
  let errors;

  beforeAll(async () => {
    errors = await import('../../../src/utils/errors.js');
  });

  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new errors.AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe(errors.ErrorCodes.INTERNAL_ERROR);
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom values', () => {
      const error = new errors.AppError('Custom error', 400, 3001, { field: 'test' });

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe(3001);
      expect(error.details).toEqual({ field: 'test' });
    });

    it('should serialize to JSON correctly', () => {
      const error = new errors.AppError('JSON error', 400, 3001, { field: 'test' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'JSON error',
        errorCode: 3001,
        details: { field: 'test' },
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create 401 error', () => {
      const error = new errors.AuthenticationError();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('認証が必要です');
    });

    it('should accept custom message', () => {
      const error = new errors.AuthenticationError('カスタムメッセージ');

      expect(error.message).toBe('カスタムメッセージ');
    });
  });

  describe('AuthorizationError', () => {
    it('should create 403 error', () => {
      const error = new errors.AuthorizationError();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('アクセス権限がありません');
    });
  });

  describe('ValidationError', () => {
    it('should create 400 error with details', () => {
      const details = [{ field: 'username', msg: '必須です' }];
      const error = new errors.ValidationError('入力エラー', details);

      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
    });
  });

  describe('NotFoundError', () => {
    it('should create 404 error', () => {
      const error = new errors.NotFoundError('ユーザー');

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('ユーザーが見つかりません');
      expect(error.resource).toBe('ユーザー');
    });
  });

  describe('ConflictError', () => {
    it('should create 409 error', () => {
      const error = new errors.ConflictError('ユーザー名は既に使用されています');

      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe(errors.ErrorCodes.ALREADY_EXISTS);
    });
  });

  describe('RateLimitError', () => {
    it('should create 429 error with retryAfter', () => {
      const error = new errors.RateLimitError('リクエスト過多', 60);

      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('errorHandler', () => {
    it('should handle AppError correctly', () => {
      const error = new errors.ValidationError('Validation failed', { field: 'test' });
      const req = { method: 'POST', originalUrl: '/api/test' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      errors.errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          errorCode: errors.ErrorCodes.VALIDATION_ERROR,
        }),
      );
    });

    it('should handle generic errors as 500', () => {
      const error = new Error('Unknown error');
      const req = { method: 'GET', originalUrl: '/api/test' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      errors.errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should set Retry-After header for rate limit errors', () => {
      const error = new errors.RateLimitError('Too many requests', 120);
      const req = { method: 'POST', originalUrl: '/api/test' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      errors.errorHandler(error, req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 120);
    });
  });

  describe('notFoundHandler', () => {
    it('should call next with NotFoundError', () => {
      const req = {};
      const res = {};
      const next = vi.fn();

      errors.notFoundHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(errors.NotFoundError));
    });
  });

  describe('ErrorCodes', () => {
    it('should have all expected error codes', () => {
      expect(errors.ErrorCodes.AUTH_TOKEN_MISSING).toBe(1001);
      expect(errors.ErrorCodes.FORBIDDEN).toBe(2001);
      expect(errors.ErrorCodes.VALIDATION_ERROR).toBe(3001);
      expect(errors.ErrorCodes.NOT_FOUND).toBe(4001);
      expect(errors.ErrorCodes.DATABASE_ERROR).toBe(5001);
      expect(errors.ErrorCodes.RATE_LIMIT_EXCEEDED).toBe(7001);
      expect(errors.ErrorCodes.INTERNAL_ERROR).toBe(9001);
    });
  });
});
