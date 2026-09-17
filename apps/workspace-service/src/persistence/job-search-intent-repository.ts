import { OperationError } from "@job-boardwalk/contracts";
import { asc, desc, eq } from "drizzle-orm";
import type {
  JobSearchIntent,
  SaveJobSearchIntentCommand,
  RecommendationPageReference,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";
import {
  jobSearchIntents,
  jobSearchIntentRecommendationPages,
  workspaceChanges,
} from "./schema.js";
import type { WorkspaceDatabase, WorkspaceTransaction } from "./database.js";

export class JobSearchIntentRepository {
  readonly #database: WorkspaceDatabase;

  public constructor(database: WorkspaceDatabase) {
    this.#database = database;
  }
  public listJobSearchIntents(): JobSearchIntent[] {
    const recommendationPages = this.#database
      .select()
      .from(jobSearchIntentRecommendationPages)
      .orderBy(asc(jobSearchIntentRecommendationPages.platformId))
      .all();
    return this.#database
      .select()
      .from(jobSearchIntents)
      .orderBy(desc(jobSearchIntents.selected), asc(jobSearchIntents.name))
      .all()
      .map((intent) =>
        Object.assign(intent, {
          recommendationPages: recommendationPages
            .filter((page) => page.intentId === intent.id)
            .map(({ label, platformId, url }): RecommendationPageReference => {
              if (!isPlatformId(platformId)) {
                throw new Error(`数据库中存在未知招聘平台：${platformId}`);
              }
              return { label, platformId, url };
            }),
        }),
      );
  }

  public saveJobSearchIntent(input: {
    city: string;
    id?: number;
    initiatedBy: "agent" | "system" | "user";
    name: string;
    position: string;
    recommendationPages: RecommendationPageReference[];
    reason: string;
    selected: boolean;
  }): JobSearchIntent {
    const now = new Date().toISOString();
    const existingId = input.id ?? null;
    const savedId = this.#database.transaction((transaction) => {
      if (input.selected) {
        transaction.update(jobSearchIntents).set({ selected: false }).run();
      }
      const intentId = saveIntentRow(transaction, input, now);
      replaceRecommendationPages(transaction, intentId, input.recommendationPages, now);
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
      throw new Error(`保存后无法读取求职方向：${String(savedId)}`);
    }
    return saved;
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
        throw new OperationError("not-found", "找不到求职方向", {
          id: input.id,
          resource: "search-intent",
        });
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

function saveIntentRow(
  transaction: WorkspaceTransaction,
  input: SaveJobSearchIntentCommand & { id?: number },
  now: string,
): number {
  const values = {
    city: input.city,
    name: input.name,
    position: input.position,
    selected: input.selected,
    updatedAt: now,
  };
  if (typeof input.id !== "number") {
    return transaction
      .insert(jobSearchIntents)
      .values(values)
      .returning({ id: jobSearchIntents.id })
      .get().id;
  }
  const updated = transaction
    .update(jobSearchIntents)
    .set(values)
    .where(eq(jobSearchIntents.id, input.id))
    .returning({ id: jobSearchIntents.id })
    .get();
  if (!updated) {
    throw new OperationError("not-found", "找不到求职方向", {
      id: input.id,
      resource: "search-intent",
    });
  }
  return updated.id;
}

function replaceRecommendationPages(
  transaction: WorkspaceTransaction,
  intentId: number,
  pages: RecommendationPageReference[],
  now: string,
): void {
  transaction
    .delete(jobSearchIntentRecommendationPages)
    .where(eq(jobSearchIntentRecommendationPages.intentId, intentId))
    .run();
  transaction
    .insert(jobSearchIntentRecommendationPages)
    .values(
      pages.map((page) => ({
        intentId,
        label: page.label,
        platformId: page.platformId,
        updatedAt: now,
        url: page.url,
      })),
    )
    .run();
}
