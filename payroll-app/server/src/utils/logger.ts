import winston from 'winston';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: () =>
      new Date()
        .toLocaleString('en-CA', { timeZone: 'Asia/Tokyo', hour12: false })
        .replace(',', ''),
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'payroll-service' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Always log to console (PM2 handles log rotation)
logger.add(
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
);

// Create a stream object with a 'write' function that will be used by `morgan`
export const stream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

/**
 * Create a child logger scoped to a specific request ID.
 * Usage: `const log = requestLogger(req.requestId); log.info('...');`
 */
export function requestLogger(requestId?: string): winston.Logger {
  if (!requestId) return logger;
  return logger.child({ requestId });
}

export default logger;
