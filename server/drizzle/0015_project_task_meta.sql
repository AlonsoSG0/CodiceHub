ALTER TABLE `tasks` ADD `priority` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `goal_id` text REFERENCES goals(id) ON DELETE SET NULL;
