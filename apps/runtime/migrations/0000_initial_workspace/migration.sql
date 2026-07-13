CREATE TABLE `platform_authentication_observations` (
	`observed_at` text NOT NULL,
	`platform_id` text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE `profile_facts` (
	`confirmed` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`key` text NOT NULL UNIQUE,
	`source` text NOT NULL,
	`updated_at` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `target_locations` (
	`city` text NOT NULL UNIQUE,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`priority` integer NOT NULL,
	`requirement` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "target_locations_requirement" CHECK("requirement" in ('required', 'preferred'))
);
--> statement-breakpoint
CREATE TABLE `workspace_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`initiated_by` text NOT NULL,
	`occurred_at` text NOT NULL,
	`operation` text NOT NULL,
	`reason` text NOT NULL,
	`subject` text NOT NULL,
	CONSTRAINT "workspace_changes_initiated_by" CHECK("initiated_by" in ('agent', 'user', 'system'))
);
