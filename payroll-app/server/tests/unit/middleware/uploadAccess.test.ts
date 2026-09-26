import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    dbGet: vi.fn(),
    readFile: vi.fn(),
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  default: { get: mocks.cacheGet, set: mocks.cacheSet },
}));

vi.mock('../../../src/db.js', () => ({
  default: { prepare: () => ({ get: mocks.dbGet }) },
}));

vi.mock('../../../src/middleware/auth.js', () => ({
  authenticateToken: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const promises = {
    ...actual.promises,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readFile: (...a: any[]) => mocks.readFile(...a),
  };
  return { ...actual, promises, default: { ...actual.default, promises } };
});

import {
  uploadAccessMiddleware,
  resolveUploadAccess,
} from '../../../src/middleware/uploadAccess.js';
import type { Request, Response, NextFunction } from 'express';

// uploadAccessMiddleware is [authenticateToken, accessCheck, express.static].
// We test the accessCheck handler directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const accessCheck = uploadAccessMiddleware[1] as any;

const makeRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

const makeReq = (path: string) =>
  ({
    path,
    user: { id: 1, username: 'test', role: 'user' as const },
  }) as unknown as Request;

describe('uploadAccess middleware path traversal', () => {
  beforeEach(() => {
    mocks.cacheGet.mockReset();
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.cacheSet.mockReset();
  });

  it('returns 404 for ".." path traversal', async () => {
    const req = makeReq('/../etc/passwd');
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await accessCheck(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for nested subdirectory access', async () => {
    const req = makeReq('/sub/file.png');
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await accessCheck(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for .meta folder access', async () => {
    const req = makeReq('/.meta/secret.json');
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await accessCheck(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for dotfile access (e.g. .gitkeep)', async () => {
    const req = makeReq('/.gitkeep');
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await accessCheck(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for empty filename', async () => {
    const req = makeReq('/');
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await accessCheck(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('resolveUploadAccess (A-2 shared access decision)', () => {
  beforeEach(() => {
    mocks.cacheGet.mockReset();
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.cacheSet.mockReset();
    mocks.dbGet.mockReset();
    mocks.dbGet.mockReturnValue(undefined);
    mocks.readFile.mockReset();
  });

  it('allows the owner', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({ uploadedBy: 7, originalName: 'a.webp' }));

    const decision = await resolveUploadAccess({ id: 7, role: 'user' }, 'a.webp');

    expect(decision.allowed).toBe(true);
    expect(mocks.dbGet).not.toHaveBeenCalled(); // owner short-circuits the grant lookup
  });

  it('allows a non-owner who has a file_access grant', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({ uploadedBy: 1 }));
    mocks.dbGet.mockReturnValue({ '1': 1 }); // file_access row present

    const decision = await resolveUploadAccess({ id: 2, role: 'user' }, 'a.webp');

    expect(decision.allowed).toBe(true);
  });

  it('denies a non-owner without a grant (403)', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({ uploadedBy: 1 }));
    mocks.dbGet.mockReturnValue(undefined);

    const decision = await resolveUploadAccess({ id: 2, role: 'user' }, 'a.webp');

    expect(decision).toEqual({ allowed: false, status: 403 });
  });

  it('allows an admin when metadata is missing (ENOENT)', async () => {
    mocks.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const decision = await resolveUploadAccess({ id: 9, role: 'admin' }, 'a.webp');

    expect(decision).toEqual({ allowed: true, metadata: null });
  });

  it('denies a non-admin on corrupted metadata (deny-by-default, 404)', async () => {
    mocks.readFile.mockResolvedValue('{ not json');

    const decision = await resolveUploadAccess({ id: 2, role: 'user' }, 'a.webp');

    expect(decision).toEqual({ allowed: false, status: 404 });
    expect(mocks.dbGet).not.toHaveBeenCalled();
  });
});
