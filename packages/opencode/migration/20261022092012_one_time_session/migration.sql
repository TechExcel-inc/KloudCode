ALTER TABLE `session` ADD `one_time` text;--> statement-breakpoint
ALTER TABLE `session` ADD `origin_id` text;--> statement-breakpoint
CREATE INDEX `session_origin_idx` ON `session` (`origin_id`);