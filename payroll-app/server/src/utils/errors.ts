import type { Request, Response, NextFunction } from 'express';
import logger from './logger.js';
import { notifyServerError } from './discord.js';

/** Sensitive fields to redact from log output */
const SENSITIVE_FIELDS = ['password', 'password_hash', 'token', 'auth', 'p256dh', 'secret'];

/**
 * Sanitize request body for safe logging by redacting sensitive fields.
 */
export const sanitizeBody = (body: Record<string, unknown>): Record<string, unknown> => {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  return sanitized;
};

// Error codes for client-side handling
export const ErrorCodes = {
  // Authentication errors (1xxx)
  AUTH_TOKEN_MISSING: 1001,
  AUTH_TOKEN_INVALID: 1002,
  AUTH_TOKEN_EXPIRED: 1003,
  AUTH_INVALID_CREDENTIALS: 1004,
  AUTH_USER_NOT_FOUND: 1005,

  // Authorization errors (2xxx)
  FORBIDDEN: 2001,
  ADMIN_REQUIRED: 2002,
  OWNER_REQUIRED: 2003,

  // Validation errors (3xxx)
  VALIDATION_ERROR: 3001,
  INVALID_INPUT: 3002,
  MISSING_REQUIRED_FIELD: 3003,

  // Resource errors (4xxx)
  NOT_FOUND: 4001,
  ALREADY_EXISTS: 4002,
  CONFLICT: 4003,

  // Database errors (5xxx)
  DATABASE_ERROR: 5001,
  TRANSACTION_FAILED: 5002,

  // External service errors (6xxx)
  PUSH_NOTIFICATION_FAILED: 6001,
  ENCRYPTION_FAILED: 6002,

  // Rate limiting (7xxx)
  RATE_LIMIT_EXCEEDED: 7001,

  // Server errors (9xxx)
  INTERNAL_ERROR: 9001,
  SERVICE_UNAVAILABLE: 9002,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Base Application Error
 */
export class AppError extends Error {
  public statusCode: number;
  public errorCode: ErrorCode;
  public details: unknown;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    details: unknown = null,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      errorCode: this.errorCode,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Authentication Error (401) */
export class AuthenticationError extends AppError {
  constructor(message = '認証が必要です', errorCode: ErrorCode = ErrorCodes.AUTH_TOKEN_MISSING) {
    super(message, 401, errorCode);
  }
}

/** Authorization Error (403) */
export class AuthorizationError extends AppError {
  constructor(message = 'アクセス権限がありません', errorCode: ErrorCode = ErrorCodes.FORBIDDEN) {
    super(message, 403, errorCode);
  }
}

/** Validation Error (400) */
export class ValidationError extends AppError {
  constructor(message = '入力データが無効です', details: unknown = null) {
    super(message, 400, ErrorCodes.VALIDATION_ERROR, details);
  }
}

/** Not Found Error (404) */
export class NotFoundError extends AppError {
  public resource: string;

  constructor(resource = 'リソース') {
    super(`${resource}が見つかりません`, 404, ErrorCodes.NOT_FOUND);
    this.resource = resource;
  }
}

/** Conflict Error (409) */
export class ConflictError extends AppError {
  constructor(message = '既に存在します') {
    super(message, 409, ErrorCodes.ALREADY_EXISTS);
  }
}

/** Database Error (500) */
export class DatabaseError extends AppError {
  public originalError: Error | null;

  constructor(message = 'データベースエラーが発生しました', originalError: Error | null = null) {
    super(message, 500, ErrorCodes.DATABASE_ERROR);
    this.originalError = originalError;
  }
}

/** Rate Limit Error (429) */
export class RateLimitError extends AppError {
  public retryAfter: number | null;

  constructor(
    message = 'リクエストが多すぎます。しばらくお待ちください。',
    retryAfter: number | null = null,
  ) {
    super(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED);
    this.retryAfter = retryAfter;
  }
}

interface ErrorWithExtras extends Error {
  statusCode?: number;
  /**
   * Express / http-errors 系が付ける HTTP ステータス。errorHandler を全ルートの
   * 末尾に移してから、静的配信層のエラー（例: URIError: Failed to decode param、
   * status=400）もここを通るようになった。従来 finalhandler が見ていたのは
   * こちらなので、statusCode と同様に尊重しないとクライアント起因のエラーが
   * 500 に化けて 5xx 通知が飛ぶ。
   */
  status?: number;
  errorCode?: ErrorCode;
  details?: unknown;
  retryAfter?: number;
  code?: string;
}

/**
 * Central error handler middleware
 */
export const errorHandler = (
  err: ErrorWithExtras,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Default values
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.errorCode || ErrorCodes.INTERNAL_ERROR;
  let message = err.message || 'サーバーエラーが発生しました';
  const details = err.details || null;

  // Log error (more details for server errors)
  if (statusCode >= 500) {
    logger.error('Server Error', {
      error: message,
      errorCode,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id,
      body: sanitizeBody(req.body),
    });
    notifyServerError({
      method: req.method,
      url: req.originalUrl,
      statusCode,
      message,
      requestId: req.requestId,
      userId: req.user?.id,
      stack: err.stack,
    });
  } else {
    logger.warn('Client Error', {
      error: message,
      errorCode,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id,
    });
  }

  // Handle specific error types
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = ErrorCodes.AUTH_TOKEN_INVALID;
    message = 'トークンが無効です';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = ErrorCodes.AUTH_TOKEN_EXPIRED;
    message = 'トークンの有効期限が切れています';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    statusCode = 409;
    errorCode = ErrorCodes.ALREADY_EXISTS;
    message = '既に存在するデータです';
  } else if (err.code === 'SQLITE_ERROR') {
    statusCode = 500;
    errorCode = ErrorCodes.DATABASE_ERROR;
    message = 'データベースエラーが発生しました';
  }

  // 予期しない 5xx の内部メッセージ（英語の例外文言など）をユーザーに見せない。
  // 詳細はこの上で logger / Discord 通知に記録済み
  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    message = 'サーバーエラーが発生しました';
  }

  // Build response
  const response: Record<string, unknown> = {
    error: message,
    errorCode,
  };

  // Include details in development or for validation errors
  if (details || (process.env.NODE_ENV === 'development' && statusCode >= 500)) {
    response.details = details || err.stack;
  }

  // Set retry-after header for rate limit errors
  if (err.retryAfter) {
    res.setHeader('Retry-After', err.retryAfter);
  }

  res.status(statusCode).json(response);
};

/**
 * Handle 404 for undefined routes
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new NotFoundError('エンドポイント'));
};
