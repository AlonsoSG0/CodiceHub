CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL DEFAULT '',
	`author` text,
	`score` real,
	`status` text NOT NULL DEFAULT 'reading',
	`start_date` text,
	`completed_date` text,
	`link` text,
	`expectation` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `books_status_idx` ON `books` (`status`);
