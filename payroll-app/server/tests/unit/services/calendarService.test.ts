import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  encrypt: vi.fn((v: unknown) => (v == null ? v : `enc_${v}`)),
  decrypt: vi.fn((v: unknown) => {
    if (v == null) return v;
    const str = String(v);
    return str.startsWith('enc_') ? str.replace('enc_', '') : str;
  }),
}));

const { mockUserRepository, mockWorkLogRepository } = vi.hoisted(() => ({
  mockUserRepository: {
    findByCalendarToken: vi.fn(),
  },
  mockWorkLogRepository: {
    findWithSlotsForCalendar: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/userRepository.js', () => ({
  userRepository: mockUserRepository,
}));

vi.mock('../../../src/repositories/workLogRepository.js', () => ({
  workLogRepository: mockWorkLogRepository,
}));

import {
  calendarService,
  InvalidTokenError,
  parseSlotInstant,
} from '../../../src/services/calendarService.js';

/** Extract the HHMMSS-bearing token of the first VEVENT's DTSTART line. */
const dtstartTime = (ics: string): string | null => {
  const line = ics.split(/\r?\n/).find((l) => l.startsWith('DTSTART'));
  const m = line?.match(/(\d{8}T\d{6})/);
  return m ? m[1] : null;
};

describe('calendarService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateFeed', () => {
    it('should throw InvalidTokenError when token is not found', () => {
      mockUserRepository.findByCalendarToken.mockReturnValue(undefined);

      expect(() => calendarService.generateFeed('invalid_token')).toThrow(InvalidTokenError);
    });

    it('should generate valid iCal feed with work logs', () => {
      mockUserRepository.findByCalendarToken.mockReturnValue({
        id: 1,
        calendar_token_created_at: new Date().toISOString(),
      });
      mockWorkLogRepository.findWithSlotsForCalendar.mockReturnValue([
        {
          id: 1,
          date: '2026-03-15',
          work_type: 'class',
          status: 'confirmed',
          student_count: 'enc_2',
          period_name: '1限',
          start_time: '16:00',
          end_time: '17:20',
        },
      ]);

      const result = calendarService.generateFeed('valid_token');

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain('1限 1:2');
      expect(result).toContain('END:VCALENDAR');
    });

    it('should skip work logs without start/end time', () => {
      mockUserRepository.findByCalendarToken.mockReturnValue({
        id: 1,
        calendar_token_created_at: new Date().toISOString(),
      });
      mockWorkLogRepository.findWithSlotsForCalendar.mockReturnValue([
        {
          id: 1,
          date: '2026-03-15',
          work_type: 'class',
          status: 'planned',
          student_count: 'enc_2',
          period_name: null,
          start_time: null,
          end_time: null,
        },
      ]);

      const result = calendarService.generateFeed('valid_token');

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).not.toContain('BEGIN:VEVENT');
    });

    it('should allow tokens without created_at date (legacy)', () => {
      mockUserRepository.findByCalendarToken.mockReturnValue({
        id: 1,
        calendar_token_created_at: null,
      });
      mockWorkLogRepository.findWithSlotsForCalendar.mockReturnValue([]);

      const result = calendarService.generateFeed('legacy_token');

      expect(result).toContain('BEGIN:VCALENDAR');
    });

    it('should query work logs with a bounded JST date window (not all rows)', () => {
      mockUserRepository.findByCalendarToken.mockReturnValue({
        id: 42,
        calendar_token_created_at: null,
      });
      mockWorkLogRepository.findWithSlotsForCalendar.mockReturnValue([]);

      calendarService.generateFeed('valid_token');

      expect(mockWorkLogRepository.findWithSlotsForCalendar).toHaveBeenCalledTimes(1);
      const args = mockWorkLogRepository.findWithSlotsForCalendar.mock.calls[0];
      const [userId, startDate, endDate] = args;
      expect(userId).toBe(42);
      // 日付ウィンドウが YYYY-MM-DD 形式で渡され、start < end であること
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      expect(startDate).toMatch(dateRe);
      expect(endDate).toMatch(dateRe);
      expect(String(startDate) < String(endDate)).toBe(true);
    });

    it('should emit a stable UID for the unconfirmed-warning event', () => {
      mockUserRepository.findByCalendarToken.mockReturnValue({
        id: 7,
        calendar_token_created_at: null,
      });
      // 過去日かつ未確定 → 警告イベントが生成される
      mockWorkLogRepository.findWithSlotsForCalendar.mockReturnValue([
        {
          id: 1,
          date: '2000-01-01',
          work_type: 'class',
          status: 'planned',
          student_count: 'enc_2',
          period_name: '1限',
          start_time: '16:00',
          end_time: '17:20',
        },
      ]);

      const result = calendarService.generateFeed('valid_token');

      expect(result).toContain('未確定が1件あります');
      // 警告イベントの UID がユーザー単位で固定されている（毎回ランダム生成されない）
      expect(result).toContain('UID:unconfirmed-warning-7@payroll');
    });
  });
});

describe('A-4: iCal is independent of the OS timezone', () => {
  const ORIGINAL_TZ = process.env.TZ;

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
    vi.clearAllMocks();
  });

  it('parseSlotInstant keeps the local wall-clock components (no absolute-TZ conversion)', () => {
    // Parsed as OS-local time, so the local h/m always echo the input regardless
    // of TZ. This local-parse is deliberate: it cancels ical-generator's
    // local-based floating formatting (see the helper's ⚠️ note). Adding a `Z`
    // here would break TZ independence.
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
      process.env.TZ = tz;
      const d = parseSlotInstant('2026-06-04', '18:50');
      expect(d.getHours()).toBe(18);
      expect(d.getMinutes()).toBe(50);
    }
  });

  it('emits the same DTSTART (…185000) under every OS timezone', () => {
    mockUserRepository.findByCalendarToken.mockReturnValue({ id: 1 });
    mockWorkLogRepository.findWithSlotsForCalendar.mockReturnValue([
      {
        id: 42,
        date: '2026-06-04',
        work_type: 'class',
        status: 'confirmed',
        student_count: 'enc_2',
        period_name: '1限',
        start_time: '18:50',
        end_time: '20:00',
      },
    ]);

    // Must be byte-identical across OS timezones — this is what protects prod
    // if DEPLOYMENT.md's `timedatectl set-timezone Asia/Tokyo` is ever applied.
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
      process.env.TZ = tz;
      expect(dtstartTime(calendarService.generateFeed('t'))).toBe('20260604T185000');
    }
  });
});

describe('InvalidTokenError', () => {
  it('should be an instance of Error', () => {
    const error = new InvalidTokenError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidTokenError');
  });
});
