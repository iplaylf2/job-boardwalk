CREATE TABLE `platform_access_observations` (
	`authentication_state` text,
	`evidence` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`interruption` text,
	`observed_at` text NOT NULL,
	`platform_id` text NOT NULL,
	CONSTRAINT "platform_access_observations_authentication_state" CHECK("authentication_state" is null or "authentication_state" in ('authenticated', 'unauthenticated')),
	CONSTRAINT "platform_access_observations_interruption" CHECK("interruption" is null or "interruption" in ('verification-required', 'access-denied')),
	CONSTRAINT "platform_access_observations_evidence" CHECK("evidence" in ('protected-resource', 'authenticated-page', 'login-redirect', 'verification-page', 'access-denied-page')),
	CONSTRAINT "platform_access_observations_assessment" CHECK(("authentication_state" = 'authenticated' and "interruption" is null and "evidence" in ('protected-resource', 'authenticated-page')) or ("authentication_state" = 'unauthenticated' and "interruption" is null and "evidence" = 'login-redirect') or ("authentication_state" is null and "interruption" = 'verification-required' and "evidence" = 'verification-page') or ("authentication_state" is null and "interruption" = 'access-denied' and "evidence" = 'access-denied-page'))
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
