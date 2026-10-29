ALTER TABLE `checklist_items` ADD `goal_id` text REFERENCES goals(id) ON DELETE SET NULL;
