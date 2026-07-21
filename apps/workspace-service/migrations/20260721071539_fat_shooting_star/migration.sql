CREATE TABLE `job_posting_sources` (
	`collected_at` text NOT NULL,
	`company` text,
	`details` text NOT NULL,
	`discovery_url` text NOT NULL,
	`education_requirement` text,
	`experience_requirement` text,
	`external_job_id` text,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`identity_key` text NOT NULL,
	`job_id` integer NOT NULL,
	`job_url` text,
	`last_checked_at` text NOT NULL,
	`location` text,
	`normalized_salary` text,
	`platform_id` text NOT NULL,
	`salary_text` text,
	`source_fingerprint` text NOT NULL,
	`summary` text NOT NULL,
	`title` text NOT NULL,
	CONSTRAINT `fk_job_posting_sources_job_id_job_postings_id_fk` FOREIGN KEY (`job_id`) REFERENCES `job_postings`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `job_postings` (
	`company` text,
	`created_at` text NOT NULL,
	`details` text NOT NULL,
	`education_requirement` text,
	`experience_requirement` text,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`identity_key` text NOT NULL UNIQUE,
	`location` text,
	`summary` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_search_intent_recommendation_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`intent_id` integer NOT NULL,
	`label` text NOT NULL,
	`platform_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`url` text NOT NULL,
	CONSTRAINT `fk_job_search_intent_recommendation_pages_intent_id_job_search_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `job_search_intents`(`id`) ON DELETE CASCADE
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
CREATE TABLE `job_source_engagements` (
	`first_observed_at` text NOT NULL,
	`kind` text NOT NULL,
	`last_observed_at` text NOT NULL,
	`source_id` integer NOT NULL,
	CONSTRAINT `job_source_engagements_pk` PRIMARY KEY(`source_id`, `kind`),
	CONSTRAINT `fk_job_source_engagements_source_id_job_posting_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `job_posting_sources`(`id`) ON DELETE CASCADE,
	CONSTRAINT "job_source_engagements_kind" CHECK("kind" in ('contacted', 'applied', 'interviewed', 'interested'))
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
CREATE TABLE `research_reports` (
	`created_at` text NOT NULL,
	`expires_at` text,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`markdown` text NOT NULL,
	`state` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` text NOT NULL
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
CREATE UNIQUE INDEX `job_posting_sources_platform_identity` ON `job_posting_sources` (`platform_id`,`identity_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_search_intent_recommendation_pages_intent_platform` ON `job_search_intent_recommendation_pages` (`intent_id`,`platform_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_search_intents_single_selected` ON `job_search_intents` (`selected`) WHERE "job_search_intents"."selected" = 1;