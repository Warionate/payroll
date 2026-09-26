import { parseISO } from 'date-fns';

// SQLite CURRENT_TIMESTAMP is in UTC.
// We need to treat the string as UTC and convert to local time (JST).
// However, if the string doesn't have 'Z', parseISO might treat it as local.
// We will append 'Z' if missing to ensure it's treated as UTC.

export function parseSQLDate(dateString: string | Date | null | undefined) {
  if (!dateString) return new Date();

  // If it's already a Date object
  if (dateString instanceof Date) return dateString;

  // If it looks like "YYYY-MM-DD HH:MM:SS" (SQLite default)
  // Append Z to treat it as UTC
  if (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.includes('+')) {
    return parseISO(dateString + 'Z');
  }

  return parseISO(dateString);
}
