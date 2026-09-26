import { describe, it, expect } from 'vitest';
import { maskCalendarTokenInUrl } from '../../../src/utils/logMask.js';

const TOKEN = 'a'.repeat(64); // 64-hex calendar token

describe('maskCalendarTokenInUrl (A-6)', () => {
  it('masks the calendar token to the first 8 chars + ellipsis', () => {
    expect(maskCalendarTokenInUrl(`/api/calendar/${TOKEN}/feed.ics`)).toBe(
      '/api/calendar/aaaaaaaa…/feed.ics',
    );
  });

  it('keeps any query string after the masked token', () => {
    expect(maskCalendarTokenInUrl(`/api/calendar/${TOKEN}/feed.ics?foo=bar`)).toBe(
      '/api/calendar/aaaaaaaa…/feed.ics?foo=bar',
    );
  });

  it('masks a mixed-case hex token (case-insensitive)', () => {
    const token = `${'AbCdEf12'}${'0'.repeat(56)}`;
    expect(maskCalendarTokenInUrl(`/api/calendar/${token}/feed.ics`)).toBe(
      '/api/calendar/AbCdEf12…/feed.ics',
    );
  });

  it('leaves non-calendar paths unchanged', () => {
    for (const url of [
      '/api/work_logs?start=2026-01-01',
      '/api/auth/refresh',
      '/uploads/abc123.webp',
      '/healthz',
      '/',
    ]) {
      expect(maskCalendarTokenInUrl(url)).toBe(url);
    }
  });

  it('does not mask a short (non-token) calendar path segment', () => {
    // Fewer than 8 hex chars after the prefix is not a token — left intact.
    expect(maskCalendarTokenInUrl('/api/calendar/abc/feed.ics')).toBe('/api/calendar/abc/feed.ics');
  });
});
