import { OperationError } from "@job-boardwalk/contracts";
import { and, eq } from "drizzle-orm";
import type { JobCardObservation } from "@job-boardwalk/contracts";
import { normalizedIdentityPart } from "#/job-library/identity.js";
import { jobPostingSourceIdentities, jobPostingSources } from "./schema.js";
import type { WorkspaceDatabase } from "./database.js";
import { jobSourceEvidence } from "./job-evidence.js";
import type { JobPostingSourceRow } from "./schema.js";

export function findJobPostingSourceByObservedIdentity(
  database: WorkspaceDatabase,
  platformId: string,
  identityKey: string,
): JobPostingSourceRow | undefined {
  return database
    .select({ source: jobPostingSources })
    .from(jobPostingSourceIdentities)
    .innerJoin(jobPostingSources, eq(jobPostingSources.id, jobPostingSourceIdentities.sourceId))
    .where(
      and(
        eq(jobPostingSourceIdentities.platformId, platformId),
        eq(jobPostingSourceIdentities.identityKey, identityKey),
      ),
    )
    .get()?.source;
}

export function requireBindableJobSource(
  database: WorkspaceDatabase,
  sourceId: number,
  observation: JobCardObservation,
  sourceIdentityKey: string,
): JobPostingSourceRow {
  const source = database
    .select()
    .from(jobPostingSources)
    .where(eq(jobPostingSources.id, sourceId))
    .get();
  if (!source) {
    throw new OperationError("not-found", "找不到岗位来源", { resource: "job-source", sourceId });
  }
  assertSourceCanBindDescription(source, observation);
  const conflict = findJobPostingSourceByObservedIdentity(
    database,
    observation.platformId,
    sourceIdentityKey,
  );
  if (conflict && conflict.id !== source.id) {
    throw new OperationError("conflict", "当前详情页已经对应另一个工作区岗位来源。", {
      reason: "identity-owned",
      sourceId,
    });
  }
  return source;
}

function assertSourceCanBindDescription(
  source: JobPostingSourceRow,
  observation: JobCardObservation,
): void {
  const sourceId = source.id;
  const evidence = jobSourceEvidence(source.cardObservation, source.descriptionObservation);
  if (source.platformId !== observation.platformId) {
    throw new OperationError("conflict", "指定岗位来源与当前详情页不属于同一招聘平台。", {
      reason: "platform-mismatch",
      sourceId,
    });
  }
  if (source.descriptionObservation || evidence.externalJobId || evidence.jobUrl) {
    throw new OperationError(
      "conflict",
      "指定来源必须同时缺少已采集详情、外部岗位 ID 和详情链接，才能显式绑定当前详情页。",
      { reason: "source-already-resolved", sourceId },
    );
  }
  if (normalizedIdentityPart(evidence.title) !== normalizedIdentityPart(observation.title)) {
    throw new OperationError("conflict", "当前详情页标题与指定岗位来源不一致。", {
      reason: "title-mismatch",
      sourceId,
    });
  }
  if (
    evidence.company &&
    observation.company &&
    normalizedIdentityPart(evidence.company) !== normalizedIdentityPart(observation.company)
  ) {
    throw new OperationError("conflict", "当前详情页公司与指定岗位来源不一致。", {
      reason: "company-mismatch",
      sourceId,
    });
  }
}
