CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`icon` text,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `habits_archived_at_idx` ON `habits` (`archived_at`);
--> statement-breakpoint
CREATE TABLE `habit_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`habit_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`unit` text,
	`target` real,
	`position` integer NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `habit_fields_habit_id_position_idx` ON `habit_fields` (`habit_id`, `position`);
--> statement-breakpoint
CREATE TABLE `habit_entries` (
	`habit_id` text NOT NULL,
	`field_id` text NOT NULL,
	`date` text NOT NULL,
	`value_num` real,
	`value_text` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY (`habit_id`, `field_id`, `date`),
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`field_id`) REFERENCES `habit_fields`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `habit_entries_habit_id_date_idx` ON `habit_entries` (`habit_id`, `date`);
