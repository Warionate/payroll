ALTER TABLE `users` ADD `display_name` text;--> statement-breakpoint
UPDATE `users` SET `display_name` = `username` WHERE `display_name` IS NULL;
