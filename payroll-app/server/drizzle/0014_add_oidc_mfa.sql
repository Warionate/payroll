ALTER TABLE `users` ADD `oidc_mfa_at` text;--> statement-breakpoint
ALTER TABLE `oidc_states` ADD `session_id` text;
