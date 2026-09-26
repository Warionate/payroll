/**
 * Broadcast category constants.
 *
 * Single source of truth for the broadcast (お知らせ) category set shared by
 * the admin form, the list/detail UI, and server-side validation. Keep this in
 * sync with the labels documented in USAGE.md / the Help page
 * (「お知らせ」「重要」「メンテ」「イベント」).
 */

/** Valid broadcast categories. `general` (お知らせ) is the default. */
export const BROADCAST_CATEGORIES = ['general', 'important', 'maintenance', 'event'] as const;

/** Default category applied when none is provided. */
export const DEFAULT_BROADCAST_CATEGORY = 'general';

export type BroadcastCategory = (typeof BROADCAST_CATEGORIES)[number];
