import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const platformAccessObservations = sqliteTable(
  "platform_access_observations",
  {
    accountDisplayName: text("account_display_name"),
    browserSessionId: text("browser_session_id").notNull(),
    evidence: text({
      enum: [
        "authentication-cookie",
        "authenticated-page",
        "account-identity",
        "login-page",
        "verification-page",
        "access-denied-page",
      ],
    }).notNull(),
    id: integer().primaryKey({ autoIncrement: true }),
    observedAt: text("observed_at").notNull(),
    platformId: text("platform_id").notNull(),
    state: text({
      enum: [
        "authentication-unverified",
        "authenticated",
        "login-required",
        "verification-required",
        "blocked",
      ],
    }).notNull(),
  },
  (table) => [
    check(
      "platform_access_observations_state",
      sql`${table.state} in ('authentication-unverified', 'authenticated', 'login-required', 'verification-required', 'blocked')`,
    ),
    check(
      "platform_access_observations_evidence",
      sql`${table.evidence} in ('authentication-cookie', 'authenticated-page', 'account-identity', 'login-page', 'verification-page', 'access-denied-page')`,
    ),
    check(
      "platform_access_observations_assessment",
      sql`(${table.state} = 'authentication-unverified' and ${table.evidence} = 'authentication-cookie') or (${table.state} = 'authenticated' and ${table.evidence} in ('authenticated-page', 'account-identity')) or (${table.state} = 'login-required' and ${table.evidence} = 'login-page') or (${table.state} = 'verification-required' and ${table.evidence} = 'verification-page') or (${table.state} = 'blocked' and ${table.evidence} = 'access-denied-page')`,
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

export const targetLocations = sqliteTable(
  "target_locations",
  {
    city: text().notNull().unique(),
    id: integer().primaryKey({ autoIncrement: true }),
    priority: integer().notNull(),
    requirement: text({ enum: ["required", "preferred"] }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("target_locations_requirement", sql`${table.requirement} in ('required', 'preferred')`),
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
