CREATE TABLE `platform_access_observations` (
	`account_display_name` text,
	`browser_session_id` text NOT NULL,
	`evidence` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`observed_at` text NOT NULL,
	`platform_id` text NOT NULL,
	`state` text NOT NULL,
	CONSTRAINT "platform_access_observations_state" CHECK("state" in ('authentication-unverified', 'authenticated', 'login-required', 'verification-required', 'blocked')),
	CONSTRAINT "platform_access_observations_evidence" CHECK("evidence" in ('authentication-cookie', 'authenticated-page', 'account-identity', 'login-page', 'verification-page', 'access-denied-page')),
	CONSTRAINT "platform_access_observations_assessment" CHECK(("state" = 'authentication-unverified' and "evidence" = 'authentication-cookie') or ("state" = 'authenticated' and "evidence" in ('authenticated-page', 'account-identity')) or ("state" = 'login-required' and "evidence" = 'login-page') or ("state" = 'verification-required' and "evidence" = 'verification-page') or ("state" = 'blocked' and "evidence" = 'access-denied-page'))
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
