CREATE TABLE `book_notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`content` text DEFAULT '{"type":"doc","content":[]}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_notebooks_book_id_idx` ON `book_notebooks` (`book_id`);
