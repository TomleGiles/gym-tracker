CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`label_fr` text NOT NULL,
	`equipment` text NOT NULL,
	`mechanic` text NOT NULL,
	`is_unilateral` integer DEFAULT false NOT NULL,
	`cues` text,
	`bar_weight_kg` real,
	`is_custom` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise_muscle` (
	`exercise_id` text NOT NULL,
	`muscle_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `muscle_id`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`muscle_id`) REFERENCES `muscle`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercise_stats` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`best_e1rm` real DEFAULT 0 NOT NULL,
	`best_weight_kg` real DEFAULT 0 NOT NULL,
	`best_set_volume` real DEFAULT 0 NOT NULL,
	`best_reps` integer DEFAULT 0 NOT NULL,
	`total_sets` integer DEFAULT 0 NOT NULL,
	`last_performed_at` text,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `muscle` (
	`id` text PRIMARY KEY NOT NULL,
	`label_fr` text NOT NULL,
	`region` text NOT NULL,
	`svg_front_id` text,
	`svg_back_id` text
);
--> statement-breakpoint
CREATE TABLE `routine` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`notes` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `routine_item` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`target_sets` integer DEFAULT 3 NOT NULL,
	`target_reps` text,
	`rest_seconds` integer DEFAULT 120,
	`superset_key` text,
	`notes` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_routine_item_routine` ON `routine_item` (`routine_id`,`position`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text,
	`routine_name` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`bodyweight_kg` real,
	`notes` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_session_started` ON `session` (`started_at`);--> statement-breakpoint
CREATE TABLE `session_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`target_sets` integer DEFAULT 3 NOT NULL,
	`target_reps` text,
	`rest_seconds` integer DEFAULT 120 NOT NULL,
	`superset_key` text,
	`notes` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_session_exercise` ON `session_exercise` (`session_id`,`position`);--> statement-breakpoint
CREATE TABLE `set_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	`rir` integer,
	`set_type` text DEFAULT 'working' NOT NULL,
	`is_pr` integer DEFAULT false NOT NULL,
	`logged_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_setlog_exercise` ON `set_log` (`exercise_id`,`logged_at`);--> statement-breakpoint
CREATE INDEX `idx_setlog_session` ON `set_log` (`session_id`);--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_queue_entity` ON `sync_queue` (`entity`,`entity_id`);