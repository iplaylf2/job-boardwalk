import { eq } from "drizzle-orm";
import type { JobCardObservation } from "@job-boardwalk/contracts";
import {
  jobPostingIdentityKey,
  jobPostingIdentityKeyFromSources,
  jobPostingContentFingerprint,
  jobPostingStateFingerprint,
} from "#/job-library/identity.js";
import { jobPostings, jobPostingSourceIdentities, jobPostingSources } from "./schema.js";
import type { WorkspaceDatabase, WorkspaceTransaction } from "./database.js";
import {
  jobSourceEvidence,
  canonicalJobPostingValues,
  storedCanonicalJobPostingValues,
} from "./job-evidence.js";
import type { JobSourceObservations } from "./job-observation-update.js";
import type { JobPostingSourceRow } from "./schema.js";

export function persistJobObservation(
  database: WorkspaceDatabase,
  input: {
    cardObservation: JobCardObservation;
    existingSource: JobPostingSourceRow | undefined;
    sourceObservations: JobSourceObservations;
    lastCheckedAt: string;
    now: string;
    sourceIdentityKey: string;
  },
): { jobId: number; outcome: "created" | "source-added" | "source-updated" } {
  return database.transaction((transaction) => {
    if (input.existingSource) {
      return updateExistingJobSource(transaction, input.existingSource, input);
    }
    const existingJob = transaction
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.identityKey, jobPostingIdentityKey(input.cardObservation)))
      .get();
    if (existingJob) {
      insertJobSource(transaction, existingJob.id, input);
      const { jobId } = reconcileJobPosting(transaction, existingJob.id, input.now);
      return { jobId, outcome: "source-added" as const };
    }
    const jobId = transaction
      .insert(jobPostings)
      .values({
        ...canonicalJobPostingValues([
          jobSourceEvidence(
            input.sourceObservations.cardObservation,
            input.sourceObservations.descriptionObservation,
          ),
        ]),
        createdAt: input.now,
        identityKey: jobPostingIdentityKey(input.cardObservation),
        updatedAt: input.now,
      })
      .returning({ id: jobPostings.id })
      .get().id;
    insertJobSource(transaction, jobId, input);
    return { jobId, outcome: "created" as const };
  });
}

function updateExistingJobSource(
  transaction: WorkspaceTransaction,
  source: JobPostingSourceRow,
  input: {
    cardObservation: JobCardObservation;
    lastCheckedAt: string;
    now: string;
    sourceIdentityKey: string;
    sourceObservations: JobSourceObservations;
  },
) {
  attachJobSourceIdentity(transaction, source.id, input);
  transaction
    .update(jobPostingSources)
    .set({
      ...input.sourceObservations,
      lastCheckedAt: input.lastCheckedAt,
    })
    .where(eq(jobPostingSources.id, source.id))
    .run();
  const { jobId } = reconcileJobPosting(transaction, source.jobId, input.now);
  return { jobId, outcome: "source-updated" as const };
}

function attachJobSourceIdentity(
  transaction: WorkspaceTransaction,
  sourceId: number,
  input: { cardObservation: JobCardObservation; sourceIdentityKey: string },
): void {
  transaction
    .insert(jobPostingSourceIdentities)
    .values({
      identityKey: input.sourceIdentityKey,
      platformId: input.cardObservation.platformId,
      sourceId,
    })
    .onConflictDoNothing()
    .run();
}

function insertJobSource(
  transaction: WorkspaceTransaction,
  jobId: number,
  input: {
    cardObservation: JobCardObservation;
    sourceObservations: JobSourceObservations;
    lastCheckedAt: string;
    sourceIdentityKey: string;
  },
): void {
  const sourceId = transaction
    .insert(jobPostingSources)
    .values({
      ...input.sourceObservations,
      jobId,
      lastCheckedAt: input.lastCheckedAt,
      platformId: input.cardObservation.platformId,
    })
    .returning({ id: jobPostingSources.id })
    .get().id;
  transaction
    .insert(jobPostingSourceIdentities)
    .values({
      identityKey: input.sourceIdentityKey,
      platformId: input.cardObservation.platformId,
      sourceId,
    })
    .run();
}

export function reconcileJobPosting(
  transaction: WorkspaceTransaction,
  jobId: number,
  updatedAt: string,
  options?: { markJobUpdated: boolean },
): { jobChanged: boolean; jobId: number } {
  const sourceEvidence = transaction
    .select()
    .from(jobPostingSources)
    .where(eq(jobPostingSources.jobId, jobId))
    .all()
    .map((source) => jobSourceEvidence(source.cardObservation, source.descriptionObservation));
  const identityKey = jobPostingIdentityKeyFromSources(sourceEvidence);
  const identityOwner = transaction
    .select({ id: jobPostings.id })
    .from(jobPostings)
    .where(eq(jobPostings.identityKey, identityKey))
    .get();
  if (identityOwner && identityOwner.id !== jobId) {
    transaction
      .update(jobPostingSources)
      .set({ jobId: identityOwner.id })
      .where(eq(jobPostingSources.jobId, jobId))
      .run();
    transaction.delete(jobPostings).where(eq(jobPostings.id, jobId)).run();
    refreshCanonicalJob(transaction, identityOwner.id, updatedAt);
    return { jobChanged: true, jobId: identityOwner.id };
  }
  transaction.update(jobPostings).set({ identityKey }).where(eq(jobPostings.id, jobId)).run();
  return {
    jobChanged: refreshCanonicalJob(transaction, jobId, updatedAt, options),
    jobId,
  };
}

function refreshCanonicalJob(
  transaction: WorkspaceTransaction,
  jobId: number,
  updatedAt: string,
  options?: { markJobUpdated: boolean },
): boolean {
  const markJobUpdated = options?.markJobUpdated ?? true;
  const currentJob = transaction.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
  if (!currentJob) {
    throw new Error(`找不到岗位：${String(jobId)}`);
  }
  const currentSources = transaction
    .select()
    .from(jobPostingSources)
    .where(eq(jobPostingSources.jobId, jobId))
    .all()
    .map((source) => jobSourceEvidence(source.cardObservation, source.descriptionObservation));
  const currentValues = storedCanonicalJobPostingValues(currentJob);
  const nextValues = canonicalJobPostingValues(currentSources);
  const contentChanged =
    jobPostingContentFingerprint(currentValues) !== jobPostingContentFingerprint(nextValues);
  if (
    markJobUpdated ||
    jobPostingStateFingerprint(currentValues) !== jobPostingStateFingerprint(nextValues)
  ) {
    transaction
      .update(jobPostings)
      .set({
        ...nextValues,
        ...(markJobUpdated || contentChanged ? { updatedAt } : {}),
      })
      .where(eq(jobPostings.id, jobId))
      .run();
  }
  return contentChanged;
}
