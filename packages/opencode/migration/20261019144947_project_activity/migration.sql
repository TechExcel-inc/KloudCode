CREATE TABLE `project_activity` (
	`user_id` text NOT NULL,
	`directory` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_active` integer NOT NULL,
	CONSTRAINT `project_activity_pk` PRIMARY KEY(`user_id`, `directory`)
);
--> statement-breakpoint
CREATE INDEX `project_activity_user_active_idx` ON `project_activity` (`user_id`,`time_active`);