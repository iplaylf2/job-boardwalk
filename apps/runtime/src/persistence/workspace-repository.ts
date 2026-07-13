import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { ProfileFact, TargetLocation } from "@job-boardwalk/contracts";

import {
  platformAuthenticationObservations,
  profileFacts,
  targetLocations,
  workspaceChanges,
} from "./schema.js";

function resolveMigrationsDirectory(): string {
  const candidates = [
    path.resolve(import.meta.dirname, "../migrations"),
    path.resolve(import.meta.dirname, "../../migrations"),
  ];
  const migrationsDirectory = candidates.find((candidate) => existsSync(candidate));
  if (!migrationsDirectory) {
    throw new Error("找不到 runtime 数据库迁移目录");
  }
  return migrationsDirectory;
}

export class WorkspaceRepository {
  readonly #client: DatabaseSync;
  readonly #database;

  public constructor(databasePath: string) {
    this.#client = new DatabaseSync(databasePath);
    this.#client.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;",
    );
    this.#database = drizzle({ client: this.#client });
    migrate(this.#database, {
      migrationsFolder: resolveMigrationsDirectory(),
    });
  }

  public close(): void {
    this.#client.close();
  }

  public recordAuthenticationObservation(platformId: PlatformId, observedAt: string): void {
    this.#database
      .insert(platformAuthenticationObservations)
      .values({ observedAt, platformId })
      .onConflictDoUpdate({
        set: { observedAt },
        setWhere: sql`excluded.observed_at > ${platformAuthenticationObservations.observedAt}`,
        target: platformAuthenticationObservations.platformId,
      })
      .run();
  }

  public getAuthenticationObservation(platformId: PlatformId): { observedAt: string } | null {
    return (
      this.#database
        .select({ observedAt: platformAuthenticationObservations.observedAt })
        .from(platformAuthenticationObservations)
        .where(eq(platformAuthenticationObservations.platformId, platformId))
        .get() ?? null
    );
  }

  public listProfileFacts(): ProfileFact[] {
    return this.#database.select().from(profileFacts).orderBy(asc(profileFacts.key)).all();
  }

  public listTargetLocations(): TargetLocation[] {
    return this.#database
      .select()
      .from(targetLocations)
      .orderBy(asc(targetLocations.priority), asc(targetLocations.city))
      .all();
  }

  public setProfileFact(input: {
    confirmed: boolean;
    key: string;
    reason: string;
    source: string;
    value: string;
  }): void {
    const now = new Date().toISOString();
    this.#database.transaction((transaction) => {
      transaction
        .insert(profileFacts)
        .values({
          confirmed: input.confirmed,
          key: input.key,
          source: input.source,
          updatedAt: now,
          value: input.value,
        })
        .onConflictDoUpdate({
          set: {
            confirmed: input.confirmed,
            source: input.source,
            updatedAt: now,
            value: input.value,
          },
          target: profileFacts.key,
        })
        .run();
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: "agent",
          occurredAt: now,
          operation: "set-profile-fact",
          reason: input.reason,
          subject: input.key,
        })
        .run();
    });
  }

  public setTargetLocation(input: {
    city: string;
    priority: number;
    reason: string;
    requirement: "preferred" | "required";
  }): void {
    const now = new Date().toISOString();
    this.#database.transaction((transaction) => {
      transaction
        .insert(targetLocations)
        .values({
          city: input.city,
          priority: input.priority,
          requirement: input.requirement,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            priority: input.priority,
            requirement: input.requirement,
            updatedAt: now,
          },
          target: targetLocations.city,
        })
        .run();
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: "agent",
          occurredAt: now,
          operation: "set-target-location",
          reason: input.reason,
          subject: input.city,
        })
        .run();
    });
  }
}
