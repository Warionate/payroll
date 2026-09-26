export type ProcessErrorType = 'Uncaught Exception' | 'Unhandled Rejection';

interface LoggerLike {
  error: (message: string, meta?: unknown) => void;
}

interface HttpServerLike {
  close: (callback: (error?: Error) => void) => void;
}

type TimerHandle = ReturnType<typeof setTimeout> | number;

interface GracefulShutdownOptions {
  httpServer: HttpServerLike;
  logger: LoggerLike;
  isProduction: boolean;
  shutdownTimeoutMs?: number;
  exit?: (code: number) => void;
  setTimeoutFn?: (callback: () => void, timeoutMs: number) => TimerHandle;
  clearTimeoutFn?: (timer: TimerHandle) => void;
}

/**
 * Build a process-level error handler with graceful shutdown behavior.
 */
export function createGracefulShutdownHandler(options: GracefulShutdownOptions) {
  const {
    httpServer,
    logger,
    isProduction,
    shutdownTimeoutMs = 15000,
    exit = (code: number) => process.exit(code),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  } = options;

  let isShuttingDown = false;

  return (type: ProcessErrorType, details: Record<string, unknown>) => {
    logger.error(`CRITICAL ERROR (${type})`, details);

    if (!isProduction) {
      return;
    }

    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.error('Starting graceful shutdown after process-level error');

    const forceExitTimer = setTimeoutFn(() => {
      logger.error('Graceful shutdown timed out. Forcing process exit.');
      exit(1);
    }, shutdownTimeoutMs);

    const timerWithUnref = forceExitTimer as TimerHandle & {
      unref?: () => void;
    };
    if (typeof timerWithUnref.unref === 'function') {
      timerWithUnref.unref();
    }

    httpServer.close((closeError?: Error) => {
      if (closeError) {
        logger.error('Error while closing HTTP server during shutdown', {
          error: closeError.message,
        });
      }

      clearTimeoutFn(forceExitTimer);
      exit(1);
    });
  };
}
