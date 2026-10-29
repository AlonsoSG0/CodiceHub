CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '{"type":"doc","content":[]}' NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`parent_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pages_parent_id_idx` ON `pages` (`parent_id`);--> statement-breakpoint
CREATE INDEX `pages_deleted_at_idx` ON `pages` (`deleted_at`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `pages_fts` USING fts5(`title`, `content`, content='pages', content_rowid='rowid');
--> statement-breakpoint
CREATE TRIGGER `pages_ai` AFTER INSERT ON `pages` BEGIN
  INSERT INTO `pages_fts` (rowid, `title`, `content`) VALUES (new.rowid, new.`title`, new.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `pages_au` AFTER UPDATE OF `title`, `content` ON `pages` BEGIN
  INSERT INTO `pages_fts` (`pages_fts`, rowid, `title`, `content`)
    VALUES ('delete', old.rowid, old.`title`, old.`content`);
  INSERT INTO `pages_fts` (rowid, `title`, `content`) VALUES (new.rowid, new.`title`, new.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `pages_ad` AFTER DELETE ON `pages` BEGIN
  INSERT INTO `pages_fts` (`pages_fts`, rowid, `title`, `content`)
    VALUES ('delete', old.rowid, old.`title`, old.`content`);
END;