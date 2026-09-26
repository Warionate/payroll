CREATE TABLE `schedule_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`event_type` text DEFAULT 'other',
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`created_by` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_events_start_date` ON `schedule_events` (`start_date`);--> statement-breakpoint
CREATE INDEX `idx_schedule_events_date_range` ON `schedule_events` (`start_date`,`end_date`);