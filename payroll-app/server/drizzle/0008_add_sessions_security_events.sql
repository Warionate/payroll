CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`method` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`authenticated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `session_id` text REFERENCES sessions(id) ON DELETE cascade;--> statement-breakpoint
CREATE TABLE `known_devices` (
	`user_id` integer NOT NULL,
	`device_hash` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `device_hash`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`detail` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_security_events_user_created` ON `security_events` (`user_id`,`created_at`);
