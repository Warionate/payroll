import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    unlink: vi.fn(),
    loggerWarn: vi.fn(),
    loggerInfo: vi.fn(),
    loggerError: vi.fn(),
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual.default,
      promises: {
        ...actual.promises,
        unlink: mocks.unlink,
      },
    },
  };
});

vi.mock('../../../src/utils/logger.js', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  encrypt: vi.fn((v: unknown) => v),
  decrypt: vi.fn((v: unknown) => v),
}));

import { deleteUploadedFilesFromMessage } from '../../../src/utils/fileCleanup.js';

describe('deleteUploadedFilesFromMessage path traversal', () => {
  beforeEach(() => {
    mocks.unlink.mockReset();
    mocks.unlink.mockResolvedValue(undefined);
    mocks.loggerWarn.mockReset();
    mocks.loggerInfo.mockReset();
    mocks.loggerError.mockReset();
  });

  it('blocks "../" path traversal in markdown links', async () => {
    await deleteUploadedFilesFromMessage('[evil](/uploads/../etc/passwd)');

    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Blocked path traversal'),
    );
  });

  it('blocks nested-path traversal attempts', async () => {
    await deleteUploadedFilesFromMessage('[evil](/uploads/sub/../../../etc/passwd)');

    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it('allows legitimate filenames (UUID-style)', async () => {
    await deleteUploadedFilesFromMessage('![img](/uploads/1234567890-abc123def456.webp)');

    // unlink should be called for the legitimate file (and its .meta)
    expect(mocks.unlink).toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('Blocked path traversal'),
    );
  });

  it('is a no-op for empty message', async () => {
    await deleteUploadedFilesFromMessage('');

    expect(mocks.unlink).not.toHaveBeenCalled();
  });
});
