import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { NormalizedSalary } from "@job-boardwalk/contracts";

export const platformAccessObservations = sqliteTable(
  "platform_access_observations",
  {
    authenticationState: text("authentication_state", {
      enum: ["authenticated", "unauthenticated"],
    }),
    evidence: text({
      enum: [
        "protected-resource",
        "authenticated-page",
        "login-redirect",
        "verification-page",
        "access-denied-page",
      ],
    }).notNull(),
    id: integer().primaryKey({ autoIncrement: true }),
    interruption: text({ enum: ["verification-required", "access-denied"] }),
    observedAt: text("observed_at").notNull(),
    platformId: text("platform_id").notNull(),
  },
  (table) => [
    check(
      "platform_access_observations_authentication_state",
      sql`${table.authenticationState} is null or ${table.authenticationState} in ('authenticated', 'unauthenticated')`,
    ),
    check(
      "platform_access_observations_interruption",
      sql`${table.interruption} is null or ${table.interruption} in ('verification-required', 'access-denied')`,
    ),
    check(
      "platform_access_observations_evidence",
      sql`${table.evidence} in ('protected-resource', 'authenticated-page', 'login-redirect', 'verification-page', 'access-denied-page')`,
    ),
    check(
      "platform_access_observations_assessment",
      sql`(${table.authenticationState} = 'authenticated' and ${table.interruption} is null and ${table.evidence} in ('protected-resource', 'authenticated-page')) or (${table.authenticationState} = 'unauthenticated' and ${table.interruption} is null and ${table.evidence} = 'login-redirect') or (${table.authenticationState} is null and ${table.interruption} = 'verification-required' and ${table.evidence} = 'verification-page') or (${table.authenticationState} is null and ${table.interruption} = 'access-denied' and ${table.evidence} = 'access-denied-page')`,
    ),
  ],
);

export const profileFacts = sqliteTable("profile_facts", {
  confirmed: integer({ mode: "boolean" }).notNull(),
  id: integer().primaryKey({ autoIncrement: true }),
  key: text().notNull().unique(),
  source: text().notNull(),
  updatedAt: text("updated_at").notNull(),
  value: text().notNull(),
});

export const jobSearchIntents = sqliteTable(
  "job_search_intents",
  {
    city: text().notNull(),
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull().unique(),
    position: text().notNull(),
    selected: integer({ mode: "boolean" }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("job_search_intents_selected", sql`${table.selected} in (0, 1)`),
    uniqueIndex("job_search_intents_single_selected")
      .on(table.selected)
      .where(sql`${table.selected} = 1`),
  ],
);

export const jobSearchIntentRecommendationPages = sqliteTable(
  "job_search_intent_recommendation_pages",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    intentId: integer("intent_id")
      .notNull()
      .references(() => jobSearchIntents.id, { onDelete: "cascade" }),
    label: text().notNull(),
    platformId: text("platform_id").notNull(),
    updatedAt: text("updated_at").notNull(),
    url: text().notNull(),
  },
  (table) => [
    uniqueIndex("job_search_intent_recommendation_pages_intent_platform").on(
      table.intentId,
      table.platformId,
    ),
  ],
);

export const jobPostings = sqliteTable("job_postings", {
  company: text(),
  createdAt: text("created_at").notNull(),
  details: text({ mode: "json" }).$type<string[]>().notNull(),
  educationRequirement: text("education_requirement"),
  experienceRequirement: text("experience_requirement"),
  id: integer().primaryKey({ autoIncrement: true }),
  identityKey: text("identity_key").notNull().unique(),
  location: text(),
  summary: text().notNull(),
  title: text().notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobPostingSources = sqliteTable(
  "job_posting_sources",
  {
    collectedAt: text("collected_at").notNull(),
    company: text(),
    details: text({ mode: "json" }).$type<string[]>().notNull(),
    discoveryUrl: text("discovery_url").notNull(),
    educationRequirement: text("education_requirement"),
    experienceRequirement: text("experience_requirement"),
    externalJobId: text("external_job_id"),
    id: integer().primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    jobUrl: text("job_url").notNull(),
    lastCheckedAt: text("last_checked_at").notNull(),
    location: text(),
    normalizedSalary: text("normalized_salary", { mode: "json" }).$type<NormalizedSalary>(),
    platformId: text("platform_id").notNull(),
    salaryText: text("salary_text"),
    sourceFingerprint: text("source_fingerprint").notNull(),
    summary: text().notNull(),
    title: text().notNull(),
  },
  (table) => [
    uniqueIndex("job_posting_sources_platform_external_id").on(
      table.platformId,
      table.externalJobId,
    ),
    uniqueIndex("job_posting_sources_platform_url").on(table.platformId, table.jobUrl),
  ],
);

export const workspaceChanges = sqliteTable(
  "workspace_changes",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    initiatedBy: text("initiated_by", { enum: ["agent", "user", "system"] }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    operation: text().notNull(),
    reason: text().notNull(),
    subject: text().notNull(),
  },
  (table) => [
    check(
      "workspace_changes_initiated_by",
      sql`${table.initiatedBy} in ('agent', 'user', 'system')`,
    ),
  ],
);
