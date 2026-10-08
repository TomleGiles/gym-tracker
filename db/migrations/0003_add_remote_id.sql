ALTER TABLE `user` ADD `remote_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_remote_id_unique` ON `user` (`remote_id`);