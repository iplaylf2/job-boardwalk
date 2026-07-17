import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

// oxlint-disable max-lines -- This class is the cohesive persistence boundary for workspace state.
import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import type {
  JobSearchIntent,
  JobSearchIntentSource,
  PlatformAccessObservation,
  ProfileFact,
  RecordedPlatformAccessObservation,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";

import {
  jobSearchIntents,
  jobSearchIntentSources,
  platformAccessObservations,
  profileFacts,
  workspaceChanges,
} from "./schema.js";

type PlatformAccessObservationRow = typeof platformAccessObservations.$inferSelect;

function samePlatformAccessState(
  left: RecordedPlatformAccessObservation,
  right: PlatformAccessObservation,
): boolean {
  return (
    left.platformId === right.platformId &&
    ("authenticationState" in left ? left.authenticationState : null) ===
      ("authenticationState" in right ? right.authenticationState : null) &&
    ("interruption" in left ? left.interruption : null) ===
      ("interruption" in right ? right.interruption : null) &&
    left.evidence === right.evidence
  );
}

function toRecordedPlatformAccessObservationMetadata(row: PlatformAccessObservationRow) {
  if (!isPlatformId(row.platformId)) {
    throw new Error(`数据库中存在未知招聘平台：${row.platformId}`);
  }
  return {
    id: row.id,
    observedAt: row.observedAt,
    platformId: row.platformId,
  };
}

function toRecordedPlatformAccessObservation(
  row: PlatformAccessObservationRow,
): RecordedPlatformAccessObservation {
  const observationMetadata = toRecordedPlatformAccessObservationMetadata(row);
  if (
    row.authenticationState === "authenticated" &&
    row.interruption === null &&
    (row.evidence === "protected-resource" || row.evidence === "authenticated-page")
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
    row.evidence === "login-redirect"
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
    observation: PlatformAccessObservation,
  ): RecordedPlatformAccessObservation {
    const row = this.#database
      .insert(platformAccessObservations)
      .values(observation)
      .returning()
      .get();
    return toRecordedPlatformAccessObservation(row);
  }

  public recordPlatformAccessObservationIfChanged(
    observation: PlatformAccessObservation,
  ): RecordedPlatformAccessObservation | null {
    const latest = this.listPlatformAccessObservations().find(
      (candidate) => candidate.platformId === observation.platformId,
    );
    return latest && samePlatformAccessState(latest, observation)
      ? null
      : this.recordPlatformAccessObservation(observation);
  }

  public listPlatformAccessObservations(): RecordedPlatformAccessObservation[] {
    return this.#database
      .select()
      .from(platformAccessObservations)
      .orderBy(
        asc(platformAccessObservations.platformId),
        desc(platformAccessObservations.observedAt),
        desc(platformAccessObservations.id),
      )
      .all()
      .map(toRecordedPlatformAccessObservation);
  }

  public listJobSearchIntents(): JobSearchIntent[] {
    const sources = this.#database
      .select()
      .from(jobSearchIntentSources)
      .orderBy(asc(jobSearchIntentSources.platformId))
      .all();
    return this.#database
      .select()
      .from(jobSearchIntents)
      .orderBy(desc(jobSearchIntents.selected), asc(jobSearchIntents.name))
      .all()
      .map((intent) =>
        Object.assign(intent, {
          sources: sources
            .filter((source) => source.intentId === intent.id)
            .map(({ label, platformId, url }): JobSearchIntentSource => {
              if (!isPlatformId(platformId)) {
                throw new Error(`数据库中存在未知招聘平台：${platformId}`);
              }
              return { label, platformId, url };
            }),
        }),
      );
  }

  public setProfileFact(input: {
    confirmed: boolean;
    initiatedBy: "agent" | "system" | "user";
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
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: "set-profile-fact",
          reason: input.reason,
          subject: input.key,
        })
        .run();
    });
  }

  // eslint-disable-next-line max-lines-per-function -- One transaction replaces the intent and its owned source set.
  public saveJobSearchIntent(input: {
    city: string;
    id?: number;
    initiatedBy: "agent" | "system" | "user";
    name: string;
    position: string;
    reason: string;
    selected: boolean;
    sources: JobSearchIntentSource[];
  }): JobSearchIntent {
    const now = new Date().toISOString();
    const existingId = input.id ?? null;
    // eslint-disable-next-line max-lines-per-function -- The callback is the atomic aggregate write.
    const savedId = this.#database.transaction((transaction) => {
      if (input.selected) {
        transaction.update(jobSearchIntents).set({ selected: false }).run();
      }
      let intentId = existingId;
      if (existingId === null) {
        intentId = transaction
          .insert(jobSearchIntents)
          .values({
            city: input.city,
            name: input.name,
            position: input.position,
            selected: input.selected,
            updatedAt: now,
          })
          .returning({ id: jobSearchIntents.id })
          .get().id;
      } else {
        const updated = transaction
          .update(jobSearchIntents)
          .set({
            city: input.city,
            name: input.name,
            position: input.position,
            selected: input.selected,
            updatedAt: now,
          })
          .where(eq(jobSearchIntents.id, existingId))
          .returning({ id: jobSearchIntents.id })
          .get();
        if (!updated) {
          throw new Error(`找不到求职倾向：${String(existingId)}`);
        }
        intentId = updated.id;
        transaction
          .delete(jobSearchIntentSources)
          .where(eq(jobSearchIntentSources.intentId, intentId))
          .run();
      }
      if (intentId === null) {
        throw new Error("求职倾向保存失败。");
      }
      transaction
        .insert(jobSearchIntentSources)
        .values(
          input.sources.map((source) => ({
            intentId,
            label: source.label,
            platformId: source.platformId,
            updatedAt: now,
            url: source.url,
          })),
        )
        .run();
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: existingId === null ? "create-job-search-intent" : "update-job-search-intent",
          reason: input.reason,
          subject: input.name,
        })
        .run();
      return intentId;
    });
    const saved = this.listJobSearchIntents().find((intent) => intent.id === savedId);
    if (!saved) {
      throw new Error(`保存后无法读取求职倾向：${String(savedId)}`);
    }
    return saved;
  }

  public deleteProfileFact(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): void {
    const now = new Date().toISOString();
    this.#database.transaction((transaction) => {
      const deleted = transaction
        .delete(profileFacts)
        .where(eq(profileFacts.id, input.id))
        .returning({ key: profileFacts.key })
        .get();
      if (deleted) {
        transaction
          .insert(workspaceChanges)
          .values({
            initiatedBy: input.initiatedBy,
            occurredAt: now,
            operation: "delete-profile-fact",
            reason: input.reason,
            subject: deleted.key,
          })
          .run();
      }
    });
  }

  public selectJobSearchIntent(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): void {
    const now = new Date().toISOString();
    this.#database.transaction((transaction) => {
      transaction.update(jobSearchIntents).set({ selected: false }).run();
      const selected = transaction
        .update(jobSearchIntents)
        .set({ selected: true, updatedAt: now })
        .where(eq(jobSearchIntents.id, input.id))
        .returning({ name: jobSearchIntents.name })
        .get();
      if (!selected) {
        throw new Error(`找不到求职倾向：${String(input.id)}`);
      }
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: "select-job-search-intent",
          reason: input.reason,
          subject: selected.name,
        })
        .run();
    });
  }

  public deleteJobSearchIntent(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): void {
    const now = new Date().toISOString();
    this.#database.transaction((transaction) => {
      const deleted = transaction
        .delete(jobSearchIntents)
        .where(eq(jobSearchIntents.id, input.id))
        .returning({ name: jobSearchIntents.name })
        .get();
      if (deleted) {
        transaction
          .insert(workspaceChanges)
          .values({
            initiatedBy: input.initiatedBy,
            occurredAt: now,
            operation: "delete-job-search-intent",
            reason: input.reason,
            subject: deleted.name,
          })
          .run();
      }
    });
  }
}
