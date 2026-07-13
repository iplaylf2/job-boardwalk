import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

import { asc, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import type {
  PlatformAccessObservation,
  ProfileFact,
  RecordPlatformAccessObservationInput,
  TargetLocation,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";

import {
  platformAccessObservations,
  profileFacts,
  targetLocations,
  workspaceChanges,
} from "./schema.js";

type PlatformAccessObservationRow = typeof platformAccessObservations.$inferSelect;

function toPlatformAccessObservation(row: PlatformAccessObservationRow): PlatformAccessObservation {
  if (!isPlatformId(row.platformId)) {
    throw new Error(`数据库中存在未知招聘平台：${row.platformId}`);
  }
  const common = {
    browserSessionId: row.browserSessionId,
    id: row.id,
    observedAt: row.observedAt,
    platformId: row.platformId,
    ...(row.accountDisplayName === null ? {} : { accountDisplayName: row.accountDisplayName }),
  };
  if (row.state === "authentication-unverified" && row.evidence === "authentication-cookie") {
    return { ...common, evidence: row.evidence, state: row.state };
  }
  if (
    row.state === "authenticated" &&
    (row.evidence === "authenticated-page" || row.evidence === "account-identity")
  ) {
    return { ...common, evidence: row.evidence, state: row.state };
  }
  if (row.state === "login-required" && row.evidence === "login-page") {
    return { ...common, evidence: row.evidence, state: row.state };
  }
  if (row.state === "verification-required" && row.evidence === "verification-page") {
    return { ...common, evidence: row.evidence, state: row.state };
  }
  if (row.state === "blocked" && row.evidence === "access-denied-page") {
    return { ...common, evidence: row.evidence, state: row.state };
  }
  throw new Error(`数据库中的平台访问状态与证据不匹配：${row.state}/${row.evidence}`);
}

function resolveMigrationsDirectory(): string {
  const candidates = [
    path.resolve(import.meta.dirname, "../migrations"),
    path.resolve(import.meta.dirname, "../../migrations"),
  ];
  const migrationsDirectory = candidates.find((candidate) => existsSync(candidate));
  if (!migrationsDirectory) {
    throw new Error("找不到 Workspace Service 数据库迁移目录");
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

  public listProfileFacts(): ProfileFact[] {
    return this.#database.select().from(profileFacts).orderBy(asc(profileFacts.key)).all();
  }

  public recordPlatformAccessObservation(
    input: RecordPlatformAccessObservationInput,
  ): PlatformAccessObservation {
    const row = this.#database.insert(platformAccessObservations).values(input).returning().get();
    return toPlatformAccessObservation(row);
  }

  public listLatestPlatformAccessObservations(): PlatformAccessObservation[] {
    const observations = this.#database
      .select()
      .from(platformAccessObservations)
      .orderBy(
        asc(platformAccessObservations.platformId),
        desc(platformAccessObservations.observedAt),
        desc(platformAccessObservations.id),
      )
      .all();
    const seenPlatforms = new Set<string>();
    return observations
      .filter((observation) => {
        if (seenPlatforms.has(observation.platformId)) {
          return false;
        }
        seenPlatforms.add(observation.platformId);
        return true;
      })
      .map(toPlatformAccessObservation);
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
