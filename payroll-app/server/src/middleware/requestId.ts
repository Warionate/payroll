/**
 * Request ID middleware — attaches a unique identifier to every request.
 *
 * The ID is:
 * 1. Set on `req.requestId`
 * 2. Echoed back as `X-Request-Id` response header
 * 3. Available to Winston via `req.requestId` for structured logging
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
