/**
 * Access-log masking helpers.
 */

/**
 * Mask calendar feed tokens in a URL for access logging (A-6).
 *
 * The iCal feed authenticates purely via a 64-hex token embedded in the URL
 * (`/api/calendar/<token>/feed.ics`). Access logs are retained for 30+ days, so
 * the full token must not linger there — a leaked log line would grant calendar
 * access until the user resets their token. Keep the first 8 characters (same as
 * the `[iCal]` info log in calendarService) and replace the rest with an
 * ellipsis. Other paths are returned unchanged.
 */
export function maskCalendarTokenInUrl(url: string): string {
  return url.replace(/(\/api\/calendar\/)([0-9a-f]{8})[0-9a-f]+/gi, '$1$2…');
}
