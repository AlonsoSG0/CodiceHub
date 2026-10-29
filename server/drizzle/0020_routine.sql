CREATE TABLE `routine_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `week_starts_on` integer NOT NULL DEFAULT 1,
  `day_start` text NOT NULL DEFAULT '07:00',
  `day_end` text NOT NULL DEFAULT '23:00',
  `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `routine_settings` (`id`, `week_starts_on`, `day_start`, `day_end`, `updated_at`) VALUES ('routine', 1, '07:00', '23:00', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
--> statement-breakpoint
CREATE TABLE `routine_day_windows` (
  `weekday` integer PRIMARY KEY NOT NULL,
  `start` text NOT NULL,
  `end` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_days` (
  `weekday` integer PRIMARY KEY NOT NULL,
  `is_template` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO `routine_days` (`weekday`, `is_template`) VALUES (0, 0), (1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0);
--> statement-breakpoint
CREATE TABLE `routine_blocks` (
  `id` text PRIMARY KEY NOT NULL,
  `weekday` integer NOT NULL,
  `title` text NOT NULL DEFAULT '',
  `start` text NOT NULL,
  `end` text NOT NULL,
  `intent` text NOT NULL DEFAULT 'must',
  `link_kind` text,
  `link_id` text,
  `note` text NOT NULL DEFAULT '',
  `position` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK ((`link_kind` IS NULL) = (`link_id` IS NULL))
);
--> statement-breakpoint
CREATE INDEX `routine_blocks_weekday_position_idx` ON `routine_blocks` (`weekday`, `position`);
--> statement-breakpoint
CREATE TABLE `routine_occurrences` (
  `block_id` text NOT NULL REFERENCES `routine_blocks`(`id`) ON DELETE CASCADE,
  `date` text NOT NULL,
  `status` text NOT NULL,
  `note` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`block_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `routine_occurrences_date_idx` ON `routine_occurrences` (`date`);
--> statement-breakpoint
CREATE TABLE `routine_mirrors` (
  `block_id` text NOT NULL,
  `date` text NOT NULL,
  `target` text NOT NULL,
  `target_id` text NOT NULL,
  `written` integer NOT NULL,
  `reason` text,
  PRIMARY KEY (`block_id`, `date`)
);
