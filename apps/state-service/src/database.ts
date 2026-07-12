import { DatabaseSync } from "node:sqlite";

import type { PlatformName } from "@job-boardwalk/platforms";
import type { ProfileFact, TargetLocation } from "@job-boardwalk/state-api";

const sqliteFalse = 0;
const sqliteTrue = 1;

interface WorkspaceChange {
  initiatedBy: string;
  occurredAt: string;
  operation: string;
  reason: string;
  subject: string;
}

export class WorkspaceDatabase {
  readonly #database: DatabaseSync;

  public constructor(databasePath: string) {
    this.#database = new DatabaseSync(databasePath);
    this.#database.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;",
    );
    this.#migrate();
  }

  public close(): void {
    this.#database.close();
  }

  #migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS platform_authentication_state (
        platform TEXT PRIMARY KEY,
        authenticated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS profile_facts (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS target_locations (
        id INTEGER PRIMARY KEY,
        city TEXT NOT NULL UNIQUE,
        priority INTEGER NOT NULL,
        requirement TEXT NOT NULL CHECK (requirement IN ('required', 'preferred')),
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS workspace_changes (
        id INTEGER PRIMARY KEY,
        operation TEXT NOT NULL,
        subject TEXT NOT NULL,
        reason TEXT NOT NULL,
        initiated_by TEXT NOT NULL CHECK (initiated_by IN ('agent', 'user', 'system')),
        occurred_at TEXT NOT NULL
      ) STRICT;
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (1, datetime('now'));
    `);
  }

  public recordPlatformAuthentication(platform: PlatformName, authenticatedAt: string): void {
    this.#database
      .prepare(`
        INSERT INTO platform_authentication_state(platform, authenticated_at)
        VALUES (?, ?)
        ON CONFLICT(platform) DO UPDATE SET
          authenticated_at = excluded.authenticated_at
        WHERE excluded.authenticated_at > platform_authentication_state.authenticated_at
      `)
      .run(platform, authenticatedAt);
  }

  public getPlatformAuthenticationState(
    platform: PlatformName,
  ): { authenticatedAt: string } | null {
    const row =
      (this.#database
        .prepare("SELECT authenticated_at FROM platform_authentication_state WHERE platform = ?")
        .get(platform) as { authenticated_at: string } | null) ?? null;
    return row === null ? null : { authenticatedAt: row.authenticated_at };
  }

  public listProfileFacts(): ProfileFact[] {
    const rows = this.#database
      .prepare(
        "SELECT id, key, value, source, confirmed, updated_at FROM profile_facts ORDER BY key",
      )
      .all() as {
      confirmed: number;
      id: number;
      key: string;
      source: string;
      updated_at: string;
      value: string;
    }[];
    return rows.map((row) => ({
      confirmed: row.confirmed === sqliteTrue,
      id: row.id,
      key: row.key,
      source: row.source,
      updatedAt: row.updated_at,
      value: row.value,
    }));
  }

  public listTargetLocations(): TargetLocation[] {
    const rows = this.#database
      .prepare(
        "SELECT id, city, priority, requirement, updated_at FROM target_locations ORDER BY priority, city",
      )
      .all() as {
      city: string;
      id: number;
      priority: number;
      requirement: "preferred" | "required";
      updated_at: string;
    }[];
    return rows.map((row) => ({
      city: row.city,
      id: row.id,
      priority: row.priority,
      requirement: row.requirement,
      updatedAt: row.updated_at,
    }));
  }

  public setProfileFact(input: {
    confirmed: boolean;
    key: string;
    reason: string;
    source: string;
    value: string;
  }): void {
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(`
          INSERT INTO profile_facts(key, value, source, confirmed, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            source = excluded.source,
            confirmed = excluded.confirmed,
            updated_at = excluded.updated_at
        `)
        .run(input.key, input.value, input.source, input.confirmed ? sqliteTrue : sqliteFalse, now);
      this.#recordChange({
        initiatedBy: "agent",
        occurredAt: now,
        operation: "set-profile-fact",
        reason: input.reason,
        subject: input.key,
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  public setTargetLocation(input: {
    city: string;
    priority: number;
    reason: string;
    requirement: "preferred" | "required";
  }): void {
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(`
          INSERT INTO target_locations(city, priority, requirement, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(city) DO UPDATE SET
            priority = excluded.priority,
            requirement = excluded.requirement,
            updated_at = excluded.updated_at
        `)
        .run(input.city, input.priority, input.requirement, now);
      this.#recordChange({
        initiatedBy: "agent",
        occurredAt: now,
        operation: "set-target-location",
        reason: input.reason,
        subject: input.city,
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #recordChange(change: WorkspaceChange): void {
    this.#database
      .prepare(`
        INSERT INTO workspace_changes(operation, subject, reason, initiated_by, occurred_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(change.operation, change.subject, change.reason, change.initiatedBy, change.occurredAt);
  }
}
