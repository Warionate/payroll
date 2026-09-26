import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// A-1/A-2 regression tests for GET /api/uploads/download/:filename.
// The route delegates to the shared resolveUploadAccess (uploadAccess.ts), which
// denies by default when the upload metadata can't be read: only an admin
// viewing a file whose .meta JSON is simply missing (ENOENT) may proceed. A
// corrupted/unreadable .meta JSON (SyntaxError, EACCES) must never fall through
// and skip the uploadedBy owner check.

const { mocks } = vi.hoisted(() => ({
  mocks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: 2, username: 'other', role: 'user' } as any,
    access: vi.fn(),
    readFile: vi.fn(),
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    dbGet: vi.fn(),
  },
}));

vi.mock('../../../src/middleware/auth.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = mocks.user;
    next();
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  default: { get: mocks.cacheGet, set: mocks.cacheSet },
}));

// Real resolveUploadAccess runs; only its db (file_access lookup) is mocked.
vi.mock('../../../src/db.js', () => ({
  default: { prepare: () => ({ get: mocks.dbGet }) },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/rateLimitStore.js', () => ({
  createSqliteRateLimitStore: () => ({}),
}));
vi.mock('express-rate-limit', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('sharp', () => ({ default: vi.fn() }));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const promises = {
    ...actual.promises,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    access: (...a: any[]) => mocks.access(...a),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readFile: (...a: any[]) => mocks.readFile(...a),
  };
  return {
    ...actual,
    promises,
    default: { ...actual.default, promises },
  };
});

import uploadsRouter from '../../../src/routes/uploads.js';

const app = express();
app.use('/api/uploads', uploadsRouter);

const FILE = 'somefile.webp';

describe('GET /api/uploads/download/:filename access control (A-1/A-2)', () => {
  beforeEach(() => {
    mocks.access.mockReset();
    mocks.readFile.mockReset();
    mocks.cacheGet.mockReset();
    mocks.cacheSet.mockReset();
    mocks.dbGet.mockReset();

    mocks.user = { id: 2, username: 'other', role: 'user' };
    mocks.access.mockResolvedValue(undefined); // file exists on disk
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.dbGet.mockReturnValue(undefined); // no file_access grant
  });

  it('denies a non-owner when metadata JSON is corrupted (non-ENOENT error)', async () => {
    // readFile succeeds but returns invalid JSON → JSON.parse throws SyntaxError
    mocks.readFile.mockResolvedValue('{ not valid json');

    const res = await request(app).get(`/api/uploads/download/${FILE}`);

    expect(res.status).toBe(404);
    // The owner check (file_access lookup) must never be reached via a
    // corrupted-metadata fall-through.
    expect(mocks.dbGet).not.toHaveBeenCalled();
  });

  it('denies an admin too when metadata JSON is corrupted (deny-by-default)', async () => {
    mocks.user = { id: 99, username: 'admin', role: 'admin' };
    mocks.readFile.mockResolvedValue('{ not valid json');

    const res = await request(app).get(`/api/uploads/download/${FILE}`);

    expect(res.status).toBe(404);
  });

  it('denies a non-owner when metadata is missing (ENOENT)', async () => {
    const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' });
    mocks.readFile.mockRejectedValue(enoent);

    const res = await request(app).get(`/api/uploads/download/${FILE}`);

    expect(res.status).toBe(404);
    // ENOENT is cached as missing
    expect(mocks.cacheSet).toHaveBeenCalledWith(`uploads:meta:${FILE}`, { missing: true }, 30);
  });

  it('denies a non-owner without a file_access grant (403)', async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify({ uploadedBy: 1, originalName: 'x.webp', mimetype: 'image/webp' }),
    );
    mocks.dbGet.mockReturnValue(undefined); // no grant

    const res = await request(app).get(`/api/uploads/download/${FILE}`);

    expect(res.status).toBe(403);
  });
});
