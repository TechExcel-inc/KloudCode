CREATE TABLE `project_link` (
	`user_id` text NOT NULL,
	`directory` text NOT NULL,
	`project_id` integer NOT NULL,
	`repo_id` text NOT NULL,
	`time_linked` integer NOT NULL,
	CONSTRAINT `project_link_pk` PRIMARY KEY(`user_id`, `directory`)
);
--> statement-breakpoint
DROP INDEX IF EXISTS `project_activity_user_active_idx`;--> statement-breakpoint
CREATE INDEX `project_link_user_project_idx` ON `project_link` (`user_id`,`project_id`);--> statement-breakpoint
DROP TABLE `project_activity`;