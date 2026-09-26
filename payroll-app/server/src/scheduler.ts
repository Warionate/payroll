import cron from 'node-cron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './utils/logger.js';
import db from './db.js';
import { sendPushNotification } from './utils/push.js';
import { notifyBackupResult } from './utils/discord.js';
import {
  cleanupExpiredBroadcastFiles,
  cleanupExpiredChatRoomFiles,
  cleanupOrphanedFiles,
  cleanupExpiredFilesFromMetadata,
} from './utils/fileCleanup.js';
import { decrypt } from './utils/crypto.js';
import { checkpointRateLimitDb } from './utils/rateLimitStore.js';
import { authService } from './services/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { workLogRepository } from './repositories/workLogRepository.js';

const checkUnconfirmedAndNotify = (): void => {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // Calculate 30 days ago for date range limit
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(thirtyDaysAgo);

  try {
    const userIds = workLogRepository.findUnconfirmedUserIds(todayStr, thirtyDaysAgoStr);

    if (userIds.length > 0) {
      logger.info(`Found ${userIds.length} users with unconfirmed logs. Sending notifications...`);
      userIds.forEach((userId) => {
        sendPushNotification(userId, {
          title: '未確定の授業があります',
          body: '過去の日付で未確定の授業があります。確認してください。',
          url: '/',
          tag: 'unconfirmed-alert',
        });
      });
    } else {
      logger.info('No unconfirmed logs found.');
    }
  } catch (err) {
    const error = err as Error;
    logger.error(`Error checking unconfirmed logs: ${error.message}`);
  }
};

const initScheduler = (): void => {
  logger.info('Initializing scheduler...');

  // Schedule backup at 04:00 JST every day.
  // backup.sh は bash 前提（rclone でのクラウドアップロード含む）のため、
  // Windows 開発機などの非本番環境ではスケジュールしない。
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Backup job not scheduled (non-production environment).');
  } else {
    cron.schedule(
      '0 4 * * *',
      () => {
        logger.info('Starting scheduled backup...');

        const backupScript = path.join(__dirname, '..', 'tools', 'backup.sh');

        // Execute the shell script which handles both backup and cloud upload
        execFile(
          'bash',
          [backupScript],
          { cwd: path.join(__dirname, '..') },
          (error, stdout, stderr) => {
            if (error) {
              logger.error(`Backup job failed: ${error.message}`);
              if (stdout) logger.info(`Backup script stdout: ${stdout}`);
              if (stderr) logger.error(`Backup script stderr: ${stderr}`);
              notifyBackupResult({
                success: false,
                message: `${error.message}\n${stderr || stdout || ''}`,
              });
              return;
            }

            logger.info('Backup job executed successfully.');
            if (stdout) logger.info(`Backup script output: ${stdout}`);
            // Some backup tools emit progress on stderr even when exiting 0.
            // Treat stderr as informational on success; failures are logged as
            // errors in the branch above.
            if (stderr) logger.info(`Backup script stderr: ${stderr}`);

            // 最新のバックアップファイルサイズを取得して通知
            let sizeBytes: number | undefined;
            try {
              const backupsDir = path.join(__dirname, '..', 'backups');
              const files = fs
                .readdirSync(backupsDir)
                .filter((f) => f.endsWith('.db'))
                .map((f) => ({ f, mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);
              if (files[0]) {
                sizeBytes = fs.statSync(path.join(backupsDir, files[0].f)).size;
              }
            } catch {
              // サイズ取得失敗は無視
            }

            notifyBackupResult({ success: true, sizeBytes, message: stdout || undefined });
          },
        );
      },
      {
        timezone: 'Asia/Tokyo',
      },
    );

    logger.info('Scheduler initialized. Backup scheduled for 04:00 JST.');
  }

  // Schedule expired broadcast file cleanup at 05:00 JST every day
  cron.schedule(
    '0 5 * * *',
    async () => {
      logger.info('Starting expired content file cleanup...');
      const cleanupTasks: Array<Promise<unknown>> = [
        cleanupExpiredBroadcastFiles(db),
        cleanupExpiredChatRoomFiles(db, (text: string) => decrypt(text) ?? ''),
        cleanupExpiredFilesFromMetadata(),
        cleanupOrphanedFiles(30),
      ];

      const cleanupResults = await Promise.allSettled(cleanupTasks);
      cleanupResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error('Async cleanup task failed', {
            taskIndex: index,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      });

      // Clean up expired/revoked refresh tokens
      try {
        const deleted = authService.cleanupExpiredTokens();
        if (deleted > 0) {
          logger.info(`Cleaned up ${deleted} expired/revoked refresh tokens.`);
        }
      } catch (err) {
        const error = err as Error;
        logger.error(`Failed to cleanup refresh tokens: ${error.message}`);
      }
    },
    {
      timezone: 'Asia/Tokyo',
    },
  );

  logger.info('File cleanup scheduled for 05:00 JST.');

  // Schedule unconfirmed alert at 09:00 JST every day
  cron.schedule(
    '0 9 * * *',
    () => {
      logger.info('Starting unconfirmed alert check...');
      checkUnconfirmedAndNotify();
    },
    {
      timezone: 'Asia/Tokyo',
    },
  );

  // Weekly database maintenance at 03:00 JST on Sundays
  cron.schedule(
    '0 3 * * 0',
    () => {
      logger.info('Starting weekly database maintenance...');
      try {
        // Checkpoint WAL to prevent file from growing too large
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.pragma('optimize');
        db.exec('ANALYZE;');
        // rate_limits.db も一応チェックポイントするが、本番（クラスタ）では
        // この primary プロセスが rate_limits.db を開いていないため no-op になる。
        // 本番の切り詰めは rateLimitStore.getDb() 内の定期タイマーが担う。
        checkpointRateLimitDb();
        logger.info('Database maintenance completed (WAL checkpoint + optimize + analyze).');
      } catch (err) {
        const error = err as Error;
        logger.error(`Database maintenance failed: ${error.message}`);
      }
    },
    {
      timezone: 'Asia/Tokyo',
    },
  );

  logger.info('Database maintenance scheduled for 03:00 JST on Sundays.');
};

export default initScheduler;
