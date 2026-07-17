CREATE TABLE `job_search_intent_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`intent_id` integer NOT NULL,
	`label` text NOT NULL,
	`platform_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`url` text NOT NULL,
	CONSTRAINT `fk_job_search_intent_sources_intent_id_job_search_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `job_search_intents`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `job_search_intents` (
	`city` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL UNIQUE,
	`position` text NOT NULL,
	`selected` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "job_search_intents_selected" CHECK("selected" in (0, 1))
);
--> statement-breakpoint
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
CREATE TABLE `workspace_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`initiated_by` text NOT NULL,
	`occurred_at` text NOT NULL,
	`operation` text NOT NULL,
	`reason` text NOT NULL,
	`subject` text NOT NULL,
	CONSTRAINT "workspace_changes_initiated_by" CHECK("initiated_by" in ('agent', 'user', 'system'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_search_intent_sources_intent_platform` ON `job_search_intent_sources` (`intent_id`,`platform_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_search_intents_single_selected` ON `job_search_intents` (`selected`) WHERE "job_search_intents"."selected" = 1;