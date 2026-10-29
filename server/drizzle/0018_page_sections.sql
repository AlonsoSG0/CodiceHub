CREATE TABLE `page_sections` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL DEFAULT '',
  `position` integer NOT NULL,
  `created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  `updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
ALTER TABLE `pages` ADD `section_id` text REFERENCES page_sections(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `pages_section_id_idx` ON `pages` (`section_id`);
