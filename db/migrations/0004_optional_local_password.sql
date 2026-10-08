PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`remote_id` text,
	`password_hash` text,
	`password_salt` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "email", "display_name", "remote_id", "password_hash", "password_salt", "created_at", "updated_at", "deleted_at") SELECT "id", "email", "display_name", "remote_id", "password_hash", "password_salt", "created_at", "updated_at", "deleted_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_remote_id_unique` ON `user` (`remote_id`);