import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import type {
  JobCardObservation,
  JobEngagementSnapshot,
  SynchronizeJobEngagementResult,
} from "@job-boardwalk/contracts";
import { jobPostingSourceIdentityKey } from "#/job-library/identity.js";
import { jobPostingSources, jobSourceEngagements, workspaceChanges } from "./schema.js";
import type { WorkspaceDatabase, WorkspaceTransaction } from "./database.js";
import { findJobPostingSourceByObservedIdentity } from "./job-source-identity.js";
import { JobObservationRepository } from "./job-observation-repository.js";

const emptyCollectionLength = 0;

const emptyCount = 0;

function jobCardObservationFromEngagement(
  snapshot: JobEngagementSnapshot,
  job: JobEngagementSnapshot["jobs"][number],
): JobCardObservation {
  return {
    observedAt: snapshot.capturedAt,
    ...(job.company ? { company: job.company } : {}),
    details: job.details,
    discoveryUrl: snapshot.sourceUrl,
    ...(job.educationRequirement ? { educationRequirement: job.educationRequirement } : {}),
    ...(job.experienceRequirement ? { experienceRequirement: job.experienceRequirement } : {}),
    ...(job.externalJobId ? { externalJobId: job.externalJobId } : {}),
    ...(job.jobUrl ? { jobUrl: job.jobUrl } : {}),
    ...(job.location ? { location: job.location } : {}),
    platformId: snapshot.platformId,
    ...(job.salaryText ? { salaryText: job.salaryText } : {}),
    summary: job.summary,
    title: job.title,
  };
}
export class JobEngagementRepository {
  readonly #database: WorkspaceDatabase;
  readonly #observations: JobObservationRepository;

  public constructor(database: WorkspaceDatabase) {
    this.#database = database;
    this.#observations = new JobObservationRepository(database);
  }
  public synchronizeJobEngagement(input: {
    initiatedBy: "agent" | "system" | "user";
    reason: string;
    snapshot: JobEngagementSnapshot;
  }): SynchronizeJobEngagementResult {
    return this.#synchronizeEngagementRelations(input, this.#saveJobEngagementSources(input));
  }

  #saveJobEngagementSources(input: {
    initiatedBy: "agent" | "system" | "user";
    reason: string;
    snapshot: JobEngagementSnapshot;
  }): number[] {
    const { snapshot } = input;
    const sourceIds: number[] = [];
    for (const job of snapshot.jobs) {
      const observation = jobCardObservationFromEngagement(snapshot, job);
      this.#observations.saveJobCardObservation({
        initiatedBy: input.initiatedBy,
        observation,
        reason: input.reason,
      });
      const identityKey = jobPostingSourceIdentityKey(observation);
      const source = findJobPostingSourceByObservedIdentity(
        this.#database,
        snapshot.platformId,
        identityKey,
      );
      if (!source) {
        throw new Error(`找不到刚保存的岗位来源：${job.title}`);
      }
      sourceIds.push(source.id);
    }
    return sourceIds;
  }

  #synchronizeEngagementRelations(
    input: {
      initiatedBy: "agent" | "system" | "user";
      reason: string;
      snapshot: JobEngagementSnapshot;
    },
    sourceIds: number[],
  ): SynchronizeJobEngagementResult {
    const { snapshot } = input;
    return this.#database.transaction((transaction) => {
      const hasNewRelations = upsertEngagementRelations(transaction, snapshot, sourceIds);
      const removed = removeMissingInterests(transaction, snapshot, sourceIds);
      if (hasNewRelations || removed > emptyCount) {
        transaction
          .insert(workspaceChanges)
          .values({
            initiatedBy: input.initiatedBy,
            occurredAt: snapshot.capturedAt,
            operation: "synchronize-job-engagement",
            reason: input.reason,
            subject: `${snapshot.platformId}:${snapshot.engagement}`,
          })
          .run();
      }
      return {
        complete: snapshot.complete,
        engagement: snapshot.engagement,
        observed: snapshot.jobs.length,
        platformId: snapshot.platformId,
        removed,
        synchronizedAt: snapshot.capturedAt,
      };
    });
  }
}

function platformSourceIdsQuery(
  transaction: WorkspaceTransaction,
  platformId: JobEngagementSnapshot["platformId"],
) {
  return transaction
    .select({ id: jobPostingSources.id })
    .from(jobPostingSources)
    .where(eq(jobPostingSources.platformId, platformId));
}

function upsertEngagementRelations(
  transaction: WorkspaceTransaction,
  snapshot: JobEngagementSnapshot,
  sourceIds: number[],
): boolean {
  const platformSourceIds = platformSourceIdsQuery(transaction, snapshot.platformId);
  const existingRows = transaction
    .select()
    .from(jobSourceEngagements)
    .where(
      and(
        inArray(jobSourceEngagements.sourceId, platformSourceIds),
        eq(jobSourceEngagements.kind, snapshot.engagement),
      ),
    )
    .all();
  let hasNewRelations = false;
  for (const sourceId of sourceIds) {
    const existing = existingRows.find((row) => row.sourceId === sourceId);
    hasNewRelations ||= !existing;
    transaction
      .insert(jobSourceEngagements)
      .values({
        firstObservedAt: existing?.firstObservedAt ?? snapshot.capturedAt,
        kind: snapshot.engagement,
        lastObservedAt: snapshot.capturedAt,
        sourceId,
      })
      .onConflictDoUpdate({
        set: {
          lastObservedAt: snapshot.capturedAt,
        },
        target: [jobSourceEngagements.sourceId, jobSourceEngagements.kind],
      })
      .run();
  }
  return hasNewRelations;
}

function removeMissingInterests(
  transaction: WorkspaceTransaction,
  snapshot: JobEngagementSnapshot,
  sourceIds: number[],
): number {
  let removed = emptyCount;
  if (snapshot.complete && snapshot.engagement === "interested") {
    const removalCondition =
      sourceIds.length === emptyCollectionLength
        ? and(
            inArray(
              jobSourceEngagements.sourceId,
              platformSourceIdsQuery(transaction, snapshot.platformId),
            ),
            eq(jobSourceEngagements.kind, snapshot.engagement),
          )
        : and(
            inArray(
              jobSourceEngagements.sourceId,
              platformSourceIdsQuery(transaction, snapshot.platformId),
            ),
            eq(jobSourceEngagements.kind, snapshot.engagement),
            notInArray(jobSourceEngagements.sourceId, sourceIds),
          );
    removed =
      transaction
        .select({ value: count() })
        .from(jobSourceEngagements)
        .where(removalCondition)
        .get()?.value ?? emptyCount;
    transaction.delete(jobSourceEngagements).where(removalCondition).run();
  }
  return removed;
}
