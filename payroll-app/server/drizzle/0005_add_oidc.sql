ALTER TABLE `users` ADD `oidc_sub` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_sub_unique` ON `users` (`oidc_sub`);--> statement-breakpoint
CREATE TABLE `oidc_states` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`purpose` text NOT NULL,
	`user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
