import { eq } from "drizzle-orm";
import type {
  JobCardObservation,
  JobDescriptionObservation,
  SaveJobObservationResult,
} from "@job-boardwalk/contracts";
import { jobPostingSourceIdentityKey } from "#/job-library/identity.js";
import { jobPostingSources, workspaceChanges } from "./schema.js";
import type { WorkspaceDatabase } from "./database.js";
import { projectDescriptionAsCardObservation } from "./job-evidence.js";
import type { PreparedJobObservation } from "./job-observation-update.js";
import {
  observationFreshness,
  observationContentMatches,
  nextSourceObservations,
} from "./job-observation-update.js";
import type { JobPostingSourceRow } from "./schema.js";
import { JobLibraryRepository } from "./job-library-repository.js";
import {
  findJobPostingSourceByObservedIdentity,
  requireBindableJobSource,
} from "./job-source-identity.js";
import { persistJobObservation, reconcileJobPosting } from "./job-observation-write.js";

export class JobObservationRepository {
  readonly #database: WorkspaceDatabase;
  readonly #library: JobLibraryRepository;

  public constructor(database: WorkspaceDatabase) {
    this.#database = database;
    this.#library = new JobLibraryRepository(database);
  }
  public saveJobCardObservation(input: {
    initiatedBy: "agent" | "system" | "user";
    observation: JobCardObservation;
    reason: string;
  }): SaveJobObservationResult {
    return this.#saveJobObservation({
      ...input,
      cardObservation: input.observation,
      kind: "card",
    });
  }

  public saveJobDescriptionObservation(input: {
    initiatedBy: "agent" | "system" | "user";
    observation: JobDescriptionObservation;
    reason: string;
    sourceId?: number;
  }): SaveJobObservationResult {
    return this.#saveJobObservation({
      ...input,
      cardObservation: projectDescriptionAsCardObservation(input.observation),
      kind: "description",
    });
  }

  #saveJobObservation(input: PreparedJobObservation): SaveJobObservationResult {
    const { cardObservation } = input;
    const sourceIdentityKey = jobPostingSourceIdentityKey(cardObservation);
    const existingSource = this.#resolveJobObservationSource(input, sourceIdentityKey);
    const { observedAt } = input.observation;
    if (existingSource) {
      const freshness = observationFreshness(existingSource, input);
      const matches = observationContentMatches(existingSource, input);
      if (freshness === "older" || (freshness === "same-time" && !matches)) {
        return this.#existingJobObservationOutcome(existingSource, "stale");
      }
      if (matches) {
        return this.#refreshMatchingJobObservation(existingSource, input);
      }
    }

    const sourceObservations = nextSourceObservations(existingSource, input);
    const now = new Date().toISOString();
    const result = persistJobObservation(this.#database, {
      cardObservation,
      existingSource,
      lastCheckedAt: existingSource
        ? latestTimestamp(existingSource.lastCheckedAt, observedAt)
        : observedAt,
      now,
      sourceIdentityKey,
      sourceObservations,
    });
    this.#database
      .insert(workspaceChanges)
      .values({
        initiatedBy: input.initiatedBy,
        occurredAt: now,
        operation: result.outcome,
        reason: input.reason,
        subject: `${cardObservation.company ? `${cardObservation.company} · ` : ""}${cardObservation.title}`,
      })
      .run();
    const job = this.#library.readJobPosting(result.jobId);
    if (!job) {
      throw new Error(`保存后无法读取岗位：${String(result.jobId)}`);
    }
    return { job, outcome: result.outcome };
  }

  #resolveJobObservationSource(input: PreparedJobObservation, observedIdentityKey: string) {
    if (input.kind === "description" && input.sourceId) {
      const existingSource = requireBindableJobSource(
        this.#database,
        input.sourceId,
        input.cardObservation,
        observedIdentityKey,
      );
      return existingSource;
    }
    return findJobPostingSourceByObservedIdentity(
      this.#database,
      input.cardObservation.platformId,
      observedIdentityKey,
    );
  }

  #existingJobObservationOutcome(
    existingSource: JobPostingSourceRow,
    outcome: "source-updated" | "stale" | "unchanged",
  ): SaveJobObservationResult {
    const job = this.#library.readJobPosting(existingSource.jobId);
    if (!job) {
      throw new Error(`找不到岗位：${String(existingSource.jobId)}`);
    }
    return { job, outcome };
  }

  #refreshMatchingJobObservation(
    existingSource: JobPostingSourceRow,
    input: PreparedJobObservation,
  ): SaveJobObservationResult {
    const now = new Date().toISOString();
    const reconciliation = this.#database.transaction((transaction) => {
      transaction
        .update(jobPostingSources)
        .set({
          ...nextSourceObservations(existingSource, input),
          lastCheckedAt: latestTimestamp(
            existingSource.lastCheckedAt,
            input.observation.observedAt,
          ),
        })
        .where(eq(jobPostingSources.id, existingSource.id))
        .run();
      const reconciled = reconcileJobPosting(transaction, existingSource.jobId, now, {
        markJobUpdated: false,
      });
      if (reconciled.jobChanged) {
        transaction
          .insert(workspaceChanges)
          .values({
            initiatedBy: input.initiatedBy,
            occurredAt: now,
            operation: "source-updated",
            reason: input.reason,
            subject: `${input.cardObservation.company ? `${input.cardObservation.company} · ` : ""}${input.cardObservation.title}`,
          })
          .run();
      }
      return reconciled;
    });
    const job = this.#library.readJobPosting(reconciliation.jobId);
    if (!job) {
      throw new Error(`刷新后无法读取岗位：${String(reconciliation.jobId)}`);
    }
    return { job, outcome: reconciliation.jobChanged ? "source-updated" : "unchanged" };
  }
}

function latestTimestamp(first: string, second: string): string {
  return first > second ? first : second;
}
