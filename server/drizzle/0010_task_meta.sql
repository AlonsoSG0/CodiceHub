ALTER TABLE `checklist_items` ADD `due_date` text;
--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `priority` text DEFAULT 'none' NOT NULL;
