import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

import { asc, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import type {
  PlatformAccessObservation,
  PlatformAccessObservationInput,
  ProfileFact,
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

function toPlatformAccessObservationMetadata(row: PlatformAccessObservationRow) {
  if (!isPlatformId(row.platformId)) {
    throw new Error(`数据库中存在未知招聘平台：${row.platformId}`);
  }
  return {
    id: row.id,
    observedAt: row.observedAt,
    platformId: row.platformId,
    ...(row.accountDisplayName === null ? {} : { accountDisplayName: row.accountDisplayName }),
  };
}

function toPlatformAccessObservation(row: PlatformAccessObservationRow): PlatformAccessObservation {
  const observationMetadata = toPlatformAccessObservationMetadata(row);
  if (
    row.authenticationState === "authenticated" &&
    row.interruption === null &&
    row.evidence === "account-identity"
  ) {
    return {
      ...observationMetadata,
      authenticationState: row.authenticationState,
      evidence: row.evidence,
    };
  }
  if (
    row.authenticationState === "unauthenticated" &&
    row.interruption === null &&
    row.evidence === "login-page"
  ) {
    return {
      ...observationMetadata,
      authenticationState: row.authenticationState,
      evidence: row.evidence,
    };
  }
  if (
    row.authenticationState === null &&
    row.interruption === "verification-required" &&
    row.evidence === "verification-page"
  ) {
    return { ...observationMetadata, evidence: row.evidence, interruption: row.interruption };
  }
  if (
    row.authenticationState === null &&
    row.interruption === "access-denied" &&
    row.evidence === "access-denied-page"
  ) {
    return { ...observationMetadata, evidence: row.evidence, interruption: row.interruption };
  }
  throw new Error(
    `数据库中的平台访问观察不匹配：${row.authenticationState}/${row.interruption}/${row.evidence}`,
  );
}

export class WorkspaceRepository {
  readonly #client: DatabaseSync;
  readonly #database;

  public constructor({
    databasePath,
    migrationsDirectory,
  }: {
    databasePath: string;
    migrationsDirectory: string;
  }) {
    if (!existsSync(migrationsDirectory)) {
      throw new Error(`找不到 Workspace Service 数据库迁移目录：${migrationsDirectory}`);
    }
    this.#client = new DatabaseSync(databasePath);
    this.#client.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;",
    );
    this.#database = drizzle({ client: this.#client });
    migrate(this.#database, {
      migrationsFolder: migrationsDirectory,
    });
  }

  public close(): void {
    this.#client.close();
  }

  public listProfileFacts(): ProfileFact[] {
    return this.#database.select().from(profileFacts).orderBy(asc(profileFacts.key)).all();
  }

  public recordPlatformAccessObservation(
    input: PlatformAccessObservationInput,
  ): PlatformAccessObservation {
    const row = this.#database.insert(platformAccessObservations).values(input).returning().get();
    return toPlatformAccessObservation(row);
  }

  public listPlatformAccessObservations(): PlatformAccessObservation[] {
    return this.#database
      .select()
      .from(platformAccessObservations)
      .orderBy(
        asc(platformAccessObservations.platformId),
        desc(platformAccessObservations.observedAt),
        desc(platformAccessObservations.id),
      )
      .all()
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
