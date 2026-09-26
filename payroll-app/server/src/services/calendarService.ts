/**
 * Calendar Service - iCal feed generation
 */
import ical from 'ical-generator';
import { decrypt } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import { userRepository } from '../repositories/userRepository.js';
import { workLogRepository } from '../repositories/workLogRepository.js';

interface WorkLogRow {
  id: number;
  date: string;
  work_type: string;
  status: string;
  student_count: string;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

const APP_URL = 'https://payroll.warionate.com';

// iCal フィードに含める期間。カレンダーアプリ（Google/Apple）はこのエンドポイントを
// 繰り返しポーリングするため、全期間の work_logs を返すと行数の増加に比例して
// 毎回のクエリ・復号・レスポンスが肥大していく（/api/work_logs に 400 日上限を
// 設けたのと同じ理由）。購読カレンダーで実用上必要なのは「最近の過去〜近い未来」
// なので、過去 90 日〜未来 180 日に絞る。過去 90 日は未確定警告（todayStr 未満を対象）の
// 実運用（スケジューラの未確定通知は 30 日遡及）を十分カバーする。
const FEED_PAST_DAYS = 90;
const FEED_FUTURE_DAYS = 180;

/** JST 基準の YYYY-MM-DD 文字列を返す */
function toJstDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * スロットの壁時計時刻 (`YYYY-MM-DD` + `HH:MM`) を **OS ローカルとして** パースする。
 *
 * このカレンダーは `timezone: 'Asia/Tokyo'` 付きで、ical-generator は floating
 * DTSTART を **プロセスのローカル TZ の壁時計成分** から生成する（UTC 基準ではない）。
 * ここでローカルとしてパースし、整形側もローカル成分を使うため、両者が相殺して
 * OS TZ に関係なく常に入力どおりの `DTSTART:...185000` を出力する（UTC / Asia/Tokyo /
 * America/New_York いずれでも同一。calendarService.test.ts で検証）。
 *
 * ⚠️ ここに `Z`（UTC 明示）を付けてはいけない。付けると整形が絶対時刻を各 OS の
 * ローカル TZ に変換するため、OS TZ が Asia/Tokyo だと 9 時間ズレる（UTC prod では
 * たまたま一致するので気づきにくい）。TZ 非依存を保つには相殺を崩さないこと。
 */
export function parseSlotInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export class InvalidTokenError extends Error {
  constructor(message = 'Invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export const calendarService = {
  generateFeed(token: string): string {
    logger.info(`[iCal] Request received for token: ${token.substring(0, 8)}...`);

    const user = userRepository.findByCalendarToken(token);
    if (!user) {
      logger.warn(`[iCal] Invalid token attempt: ${token.substring(0, 8)}...`);
      throw new InvalidTokenError();
    }

    // 取得範囲を JST 基準の固定ウィンドウに限定する（全件取得を避ける）
    const now = new Date();
    const pastBound = new Date(now);
    pastBound.setDate(pastBound.getDate() - FEED_PAST_DAYS);
    const futureBound = new Date(now);
    futureBound.setDate(futureBound.getDate() + FEED_FUTURE_DAYS);
    const startDate = toJstDateString(pastBound);
    const endDate = toJstDateString(futureBound);

    const rows = workLogRepository.findWithSlotsForCalendar(
      user.id,
      startDate,
      endDate,
    ) as WorkLogRow[];

    const calendar = ical({
      name: 'Payroll App Schedule',
      timezone: 'Asia/Tokyo',
    });

    rows.forEach((row) => {
      if (!row.start_time || !row.end_time) return;

      const start = parseSlotInstant(row.date, row.start_time);
      const end = parseSlotInstant(row.date, row.end_time);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        logger.warn('[iCal] Invalid date for row', { rowId: row.id, date: row.date });
        return;
      }

      let studentCount = 0;
      try {
        studentCount = Number(decrypt(row.student_count));
      } catch (e) {
        const error = e as Error;
        logger.error('[iCal] Failed to decrypt student_count', {
          rowId: row.id,
          error: error.message,
        });
      }

      calendar.createEvent({
        id: `worklog-${row.id}@payroll`,
        start,
        end,
        summary: `${row.period_name || '未定'} 1:${studentCount}`,
        description: `生徒数: ${studentCount}名\nステータス: ${row.status === 'completed' ? '確定' : '予定'}\n\nアプリを開く: ${APP_URL}?date=${row.date}`,
        url: `${APP_URL}?date=${row.date}`,
      });
    });

    // Check for unconfirmed past entries (JST 基準の今日を上で算出済み)
    const todayStr = toJstDateString(now);

    const unconfirmedRows = rows.filter((row) => {
      return row.date < todayStr && row.status !== 'completed' && row.start_time && row.end_time;
    });

    if (unconfirmedRows.length > 0) {
      logger.info('[iCal] Unconfirmed past entries found', {
        count: unconfirmedRows.length,
        userId: user.id,
        dates: unconfirmedRows.map((r) => r.date),
      });

      calendar.createEvent({
        // 固定 UID を与えることで、購読カレンダー側で毎回新しいイベントとして
        // 増殖・再通知されず、単一のリマインダーとして更新される。
        id: `unconfirmed-warning-${user.id}@payroll`,
        start: now,
        allDay: true,
        summary: `⚠️未確定が${unconfirmedRows.length}件あります`,
        description: `過去の日付で未確定の授業があります。アプリを開いて「保存」してください。\n\n対象日:\n${unconfirmedRows.map((r) => r.date).join('\n')}\n\nアプリを開く: ${APP_URL}`,
        url: APP_URL,
      });
    }

    return calendar.toString();
  },
};
