ALTER TABLE `users` ADD `calendar_token_hash` text;--> statement-breakpoint
CREATE INDEX `idx_users_calendar_token_hash` ON `users` (`calendar_token_hash`);
