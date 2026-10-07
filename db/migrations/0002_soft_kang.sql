CREATE TABLE `cardio_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`label_fr` text NOT NULL,
	`setting` text NOT NULL,
	`icon` text NOT NULL,
	`pace` text,
	`level_label` text,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cardio_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`position` integer NOT NULL,
	`duration_sec` integer NOT NULL,
	`distance_m` real,
	`calories` integer,
	`level` real,
	`logged_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `cardio_activity`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cardio_log_session` ON `cardio_log` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_cardio_log_activity` ON `cardio_log` (`activity_id`,`logged_at`);