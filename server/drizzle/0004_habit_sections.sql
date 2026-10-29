ALTER TABLE `habits` ADD COLUMN `section` text DEFAULT 'habits' NOT NULL;
--> statement-breakpoint
CREATE INDEX `habits_section_idx` ON `habits` (`section`);
