import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGracefulShutdownHandler } from '../../../src/utils/gracefulShutdown.js';

describe('createGracefulShutdownHandler', () => {
  const logger = {
    error: vi.fn(),
  };

  const createServer = () => ({
    close: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not shut down in non-production', () => {
    const httpServer = createServer();
    const exit = vi.fn();

    const handler = createGracefulShutdownHandler({
      httpServer,
      logger,
      isProduction: false,
      exit,
    });

    handler('Uncaught Exception', { error: 'boom' });

    expect(logger.error).toHaveBeenCalledWith('CRITICAL ERROR (Uncaught Exception)', {
      error: 'boom',
    });
    expect(httpServer.close).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('should close server and exit once in production', () => {
    const httpServer = createServer();
    const exit = vi.fn();
    const clearTimeoutFn = vi.fn();
    const timeoutRef = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;

    const handler = createGracefulShutdownHandler({
      httpServer,
      logger,
      isProduction: true,
      exit,
      setTimeoutFn: vi.fn(() => timeoutRef),
      clearTimeoutFn,
    });

    let closeCallback: ((error?: Error) => void) | undefined;
    httpServer.close.mockImplementation((callback: (error?: Error) => void) => {
      closeCallback = callback;
    });

    handler('Unhandled Rejection', { reason: 'rejected' });
    expect(httpServer.close).toHaveBeenCalledTimes(1);

    handler('Uncaught Exception', { error: 'second' });
    expect(httpServer.close).toHaveBeenCalledTimes(1);

    closeCallback?.();

    expect(clearTimeoutFn).toHaveBeenCalledWith(timeoutRef);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('should force exit on timeout when close does not complete', () => {
    const httpServer = createServer();
    const exit = vi.fn();
    const timeoutRef = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;

    let timeoutCallback: (() => void) | undefined;

    const handler = createGracefulShutdownHandler({
      httpServer,
      logger,
      isProduction: true,
      exit,
      setTimeoutFn: vi.fn((callback: () => void) => {
        timeoutCallback = callback;
        return timeoutRef;
      }),
      clearTimeoutFn: vi.fn(),
    });

    httpServer.close.mockImplementation(() => {
      // intentionally no callback invocation
    });

    handler('Uncaught Exception', { error: 'timeout-case' });
    if (timeoutCallback) {
      timeoutCallback();
    }

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith('Graceful shutdown timed out. Forcing process exit.');
  });
});
