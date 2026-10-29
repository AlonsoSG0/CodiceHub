ALTER TABLE `goals` ADD `due_date` text;
--> statement-breakpoint
ALTER TABLE `goals` ADD `status` text DEFAULT 'todo' NOT NULL;
