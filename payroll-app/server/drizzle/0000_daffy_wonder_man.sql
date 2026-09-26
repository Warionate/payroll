CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`priority` text DEFAULT 'normal',
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_announcements_active` ON `announcements` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_announcements_active_created` ON `announcements` (`is_active`,`created_at`);--> statement-breakpoint
CREATE TABLE `broadcast_reads` (
	`broadcast_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`read_at` text DEFAULT (CURRENT_TIMESTAMP),
	PRIMARY KEY(`broadcast_id`, `user_id`),
	FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_broadcast_reads_user` ON `broadcast_reads` (`user_id`);--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender_id` integer,
	`title` text,
	`message` text NOT NULL,
	`category` text DEFAULT 'general',
	`expires_at` text,
	`deleted_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_broadcasts_expires` ON `broadcasts` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_broadcasts_deleted` ON `broadcasts` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_broadcasts_created` ON `broadcasts` (`created_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer,
	`sender_id` integer,
	`message` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_room` ON `chat_messages` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_room_created` ON `chat_messages` (`room_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_sender` ON `chat_messages` (`sender_id`);--> statement-breakpoint
CREATE TABLE `chat_room_members` (
	`room_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`joined_at` text DEFAULT (CURRENT_TIMESTAMP),
	`last_read_at` text,
	PRIMARY KEY(`room_id`, `user_id`),
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chat_room_members_user` ON `chat_room_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_room_members_room` ON `chat_room_members` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_room_members_user_room_read` ON `chat_room_members` (`user_id`,`room_id`,`last_read_at`);--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'group',
	`created_by` integer,
	`expires_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `file_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`user_id` integer NOT NULL,
	`room_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_file_access_filename` ON `file_access` (`filename`);--> statement-breakpoint
CREATE INDEX `idx_file_access_user` ON `file_access` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_file_access_filename_user_room` ON `file_access` (`filename`,`user_id`,`room_id`);--> statement-breakpoint
CREATE TABLE `fixed_shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`day_of_week` integer,
	`schedule_slot_id` integer,
	`student_count` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_slot_id`) REFERENCES `schedule_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_fixed_shifts_user` ON `fixed_shifts` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_fixed_shifts_user_day` ON `fixed_shifts` (`user_id`,`day_of_week`);--> statement-breakpoint
CREATE TABLE `pattern_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`pattern_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pattern_id`) REFERENCES `schedule_patterns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pattern_assignments_dates` ON `pattern_assignments` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_pattern_assignments_pattern` ON `pattern_assignments` (`pattern_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`start_date` text NOT NULL,
	`wage_1_student` text,
	`wage_2_students` text,
	`wage_3_students` text,
	`wage_4_students` text,
	`hourly_wage` text,
	`allowance_day` text,
	`allowance_gap` text,
	`is_active` integer DEFAULT 1,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_rates_user_id` ON `rates` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_rates_user_start` ON `rates` (`user_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`revoked` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_unique` ON `refresh_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_token` ON `refresh_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `salary_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`year_month` text NOT NULL,
	`adjustment_type` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_salary_adjustments_user` ON `salary_adjustments` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_salary_adjustments_user_month` ON `salary_adjustments` (`user_id`,`year_month`);--> statement-breakpoint
CREATE INDEX `idx_salary_adjustments_year_month` ON `salary_adjustments` (`year_month`);--> statement-breakpoint
CREATE TABLE `schedule_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `schedule_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern_id` integer,
	`period_name` text,
	`start_time` text,
	`end_time` text,
	FOREIGN KEY (`pattern_id`) REFERENCES `schedule_patterns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_slots_pattern` ON `schedule_slots` (`pattern_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user',
	`calendar_token` text,
	`calendar_token_created_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_calendar_token` ON `users` (`calendar_token`);--> statement-breakpoint
CREATE TABLE `work_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`date` text NOT NULL,
	`work_type` text NOT NULL,
	`schedule_slot_id` integer,
	`student_count` text,
	`duration_minutes` text,
	`status` text DEFAULT 'planned',
	`note` text,
	`calculated_amount` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_slot_id`) REFERENCES `schedule_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_logs_date` ON `work_logs` (`date`);--> statement-breakpoint
CREATE INDEX `idx_work_logs_slot` ON `work_logs` (`schedule_slot_id`);--> statement-breakpoint
CREATE INDEX `idx_work_logs_user` ON `work_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_work_logs_user_date` ON `work_logs` (`user_id`,`date`);