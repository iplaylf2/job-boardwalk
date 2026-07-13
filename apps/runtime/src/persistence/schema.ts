import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const platformAuthenticationObservations = sqliteTable(
  "platform_authentication_observations",
  {
    observedAt: text("observed_at").notNull(),
    platformId: text("platform_id").primaryKey(),
  },
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
