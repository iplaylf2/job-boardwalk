import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

// oxlint-disable max-lines -- This class is the cohesive persistence boundary for workspace state.
import { and, asc, count, desc, eq, gt, inArray, isNull, like, notInArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import type {
  JobCardObservation,
  JobDescriptionObservation,
  JobPostingDescription,
  JobPosting,
  JobPostingPage,
  JobPostingSource,
  JobSourceEngagement,
  JobSearchIntent,
  RecommendationPageReference,
  PlatformAccessObservation,
  ProfileFact,
  ResearchReport,
  ResearchReportSummary,
  RecordedPlatformAccessObservation,
  SaveJobObservationResult,
  JobEngagementSnapshot,
  SynchronizeJobEngagementResult,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";

import { parseJobPostingSalary } from "#/job-library/salary.js";
import type { JobLibraryQuery } from "#/job-library/query.js";

import {
  jobPostings,
  jobPostingSources,
  jobSourceEngagements,
  jobSearchIntents,
  jobSearchIntentRecommendationPages,
  platformAccessObservations,
  profileFacts,
  researchReports,
  workspaceChanges,
} from "./schema.js";

type PlatformAccessObservationRow = typeof platformAccessObservations.$inferSelect;
type JobPostingRow = typeof jobPostings.$inferSelect;
type JobPostingSourceRow = typeof jobPostingSources.$inferSelect;
type JobSourceEngagementRow = typeof jobSourceEngagements.$inferSelect;
type ResearchReportRow = typeof researchReports.$inferSelect;
const firstParameterIndex = 0;
type WorkspaceDatabase = ReturnType<typeof drizzle>;
type WorkspaceTransactionCallback = Parameters<
  WorkspaceDatabase["transaction"]
>[typeof firstParameterIndex];
type WorkspaceTransaction = Parameters<WorkspaceTransactionCallback>[typeof firstParameterIndex];
type PreparedJobObservation =
  | {
      cardObservation: JobCardObservation;
      initiatedBy: "agent" | "system" | "user";
      kind: "card";
      observation: JobCardObservation;
      reason: string;
    }
  | {
      cardObservation: JobCardObservation;
      initiatedBy: "agent" | "system" | "user";
      kind: "description";
      observation: JobDescriptionObservation;
      reason: string;
    };
type SourceObservations = Pick<JobPostingSourceRow, "cardObservation" | "descriptionObservation">;
const emptyCollectionLength = 0;
const emptyCount = 0;
const firstPage = 1;

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedIdentityPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replaceAll(/[^\p{L}\p{N}]+/gu, "");
}

function normalizedCompanyIdentity(value: string): string {
  return normalizedIdentityPart(value).replace(/(?:有限责任公司|股份有限公司|有限公司|公司)$/u, "");
}

function jobPostingIdentityKey(observation: JobCardObservation): string {
  if (!observation.company || !observation.location) {
    return jobPostingSourceIdentityKey(observation);
  }
  return hashValue([
    normalizedCompanyIdentity(observation.company),
    normalizedIdentityPart(observation.title.replaceAll(/[【[][^】\]]+[】\]]/gu, "")),
    normalizedIdentityPart(observation.location),
  ]);
}

function cardObservationFingerprint(observation: JobCardObservation): string {
  const { discoveryUrl: _discoveryUrl, jobUrl, observedAt: _observedAt, ...facts } = observation;
  return hashValue({
    ...facts,
    details: [...new Set(facts.details)].toSorted(),
    jobUrl: jobUrl ? new URL(jobUrl).pathname : null,
  });
}

function projectDescriptionAsCardObservation(
  observation: JobDescriptionObservation,
): JobCardObservation {
  return {
    observedAt: observation.observedAt,
    ...(observation.company ? { company: observation.company } : {}),
    details: observation.details,
    discoveryUrl: observation.jobUrl,
    ...(observation.educationRequirement
      ? { educationRequirement: observation.educationRequirement }
      : {}),
    ...(observation.experienceRequirement
      ? { experienceRequirement: observation.experienceRequirement }
      : {}),
    ...(observation.externalJobId ? { externalJobId: observation.externalJobId } : {}),
    jobUrl: observation.jobUrl,
    ...(observation.location ? { location: observation.location } : {}),
    platformId: observation.platformId,
    ...(observation.salaryText ? { salaryText: observation.salaryText } : {}),
    summary: observation.description.text.replaceAll(/\s+/gu, " ").trim(),
    title: observation.title,
  };
}

function descriptionObservationFingerprint(observation: JobDescriptionObservation): string {
  const { description, observedAt: _observedAt, ...facts } = observation;
  return hashValue({
    ...facts,
    description: { text: description.text, truncated: description.truncated },
    details: [...new Set(facts.details)].toSorted(),
  });
}

function jobPostingSourceIdentityKey(observation: JobCardObservation): string {
  if (observation.externalJobId) {
    return hashValue([observation.platformId, observation.externalJobId]);
  }
  if (observation.jobUrl) {
    return hashValue([observation.platformId, new URL(observation.jobUrl).pathname]);
  }
  return hashValue([
    observation.platformId,
    normalizedIdentityPart(observation.company ?? ""),
    normalizedIdentityPart(observation.title),
    normalizedIdentityPart(observation.location ?? ""),
  ]);
}

function toJobSourceEngagement(row: JobSourceEngagementRow): JobSourceEngagement {
  return {
    firstObservedAt: row.firstObservedAt,
    kind: row.kind,
    lastObservedAt: row.lastObservedAt,
  };
}

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

function toJobPostingSource(
  row: JobPostingSourceRow,
  engagementRows: JobSourceEngagementRow[],
): JobPostingSource {
  if (!isPlatformId(row.platformId)) {
    throw new Error(`数据库中存在未知招聘平台：${row.platformId}`);
  }
  const evidence = jobSourceEvidence(row.cardObservation, row.descriptionObservation);
  const normalizedSalary = evidence.salaryText ? parseJobPostingSalary(evidence.salaryText) : null;
  return {
    ...evidence,
    engagements: engagementRows
      .filter(({ sourceId }) => sourceId === row.id)
      .map(toJobSourceEngagement),
    id: row.id,
    jobId: row.jobId,
    lastCheckedAt: row.lastCheckedAt,
    ...(normalizedSalary ? { normalizedSalary } : {}),
  };
}

type JobSourceEvidence = JobCardObservation & {
  description?: JobPostingDescription;
};

function jobSourceEvidence(
  cardObservation: JobCardObservation | null,
  descriptionObservation: JobDescriptionObservation | null,
): JobSourceEvidence {
  if (!descriptionObservation) {
    if (!cardObservation) {
      throw new Error("岗位来源至少需要卡片或详情证据。");
    }
    return cardObservation;
  }
  const descriptionEvidence = projectDescriptionAsCardObservation(descriptionObservation);
  if (!cardObservation) {
    return { ...descriptionEvidence, description: descriptionObservation.description };
  }
  return {
    ...cardObservation,
    ...descriptionEvidence,
    description: descriptionObservation.description,
    details: [
      ...new Set([...cardObservation.details, ...descriptionObservation.details]),
    ].toSorted(),
    discoveryUrl: cardObservation.discoveryUrl,
    observedAt:
      descriptionObservation.observedAt > cardObservation.observedAt
        ? descriptionObservation.observedAt
        : cardObservation.observedAt,
    summary: cardObservation.summary,
  };
}

function observationTime(input: PreparedJobObservation): string {
  return input.observation.observedAt;
}

function observationMatches(
  source: JobPostingSourceRow | undefined,
  input: PreparedJobObservation,
): boolean {
  if (input.kind === "card") {
    return Boolean(
      source?.cardObservation &&
      cardObservationFingerprint(source.cardObservation) ===
        cardObservationFingerprint(input.observation),
    );
  }
  return Boolean(
    source?.descriptionObservation &&
    descriptionObservationFingerprint(source.descriptionObservation) ===
      descriptionObservationFingerprint(input.observation),
  );
}

function updatedSourceObservations(
  source: JobPostingSourceRow | undefined,
  input: PreparedJobObservation,
): SourceObservations {
  return input.kind === "card"
    ? {
        cardObservation: input.observation,
        descriptionObservation: source?.descriptionObservation ?? null,
      }
    : {
        cardObservation: source?.cardObservation ?? null,
        descriptionObservation: input.observation,
      };
}

function canonicalJobPostingValues(observations: JobSourceEvidence[]) {
  const [firstObservation, ...remainingObservations] = observations;
  if (!firstObservation) {
    throw new Error("岗位规范化至少需要一个平台来源。");
  }
  let latest = firstObservation;
  let latestDescription = firstObservation.description;
  for (const observation of remainingObservations) {
    if (observation.observedAt > latest.observedAt) {
      latest = observation;
    }
    if (
      observation.description &&
      (!latestDescription || observation.description.capturedAt > latestDescription.capturedAt)
    ) {
      latestDescription = observation.description;
    }
  }
  return {
    company: latest.company ?? null,
    description: latestDescription ?? null,
    details: [...new Set(observations.flatMap(({ details }) => details))].toSorted(),
    educationRequirement: latest.educationRequirement ?? null,
    experienceRequirement: latest.experienceRequirement ?? null,
    location: latest.location ?? null,
    summary: latest.summary,
    title: latest.title,
  };
}

function toJobPosting(
  job: JobPostingRow,
  sourceRows: JobPostingSourceRow[],
  engagementRows: JobSourceEngagementRow[],
): JobPosting {
  return {
    ...(job.company ? { company: job.company } : {}),
    createdAt: job.createdAt,
    ...(job.description ? { description: job.description } : {}),
    details: job.details,
    ...(job.educationRequirement ? { educationRequirement: job.educationRequirement } : {}),
    ...(job.experienceRequirement ? { experienceRequirement: job.experienceRequirement } : {}),
    id: job.id,
    ...(job.location ? { location: job.location } : {}),
    sources: sourceRows
      .filter((source) => source.jobId === job.id)
      .map((source) => toJobPostingSource(source, engagementRows)),
    summary: job.summary,
    title: job.title,
    updatedAt: job.updatedAt,
  };
}

function toResearchReport(row: ResearchReportRow): ResearchReport {
  return {
    createdAt: row.createdAt,
    ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
    id: row.id,
    markdown: row.markdown,
    state: row.state,
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

function toResearchReportSummary(row: ResearchReportRow): ResearchReportSummary {
  const { markdown: _markdown, ...summary } = toResearchReport(row);
  return summary;
}

function unexpiredResearchReportCondition(now: string) {
  return or(isNull(researchReports.expiresAt), gt(researchReports.expiresAt, now));
}

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

  public listResearchReports(): ResearchReportSummary[] {
    return this.#database
      .select()
      .from(researchReports)
      .where(unexpiredResearchReportCondition(new Date().toISOString()))
      .orderBy(desc(researchReports.updatedAt), desc(researchReports.id))
      .all()
      .map(toResearchReportSummary);
  }

  public readResearchReport(id: number): ResearchReport | null {
    const unexpired = unexpiredResearchReportCondition(new Date().toISOString());
    const row = this.#database
      .select()
      .from(researchReports)
      .where(and(eq(researchReports.id, id), unexpired))
      .get();
    return row ? toResearchReport(row) : null;
  }

  // eslint-disable-next-line max-lines-per-function -- One transaction owns report persistence and attribution.
  public saveResearchReport(input: {
    expiresAt?: string;
    id?: number;
    initiatedBy: "agent" | "system" | "user";
    markdown: string;
    reason: string;
    state: "complete" | "draft";
    title: string;
  }): ResearchReport | null {
    const now = new Date().toISOString();
    return this.#database.transaction((transaction) => {
      const row = input.id
        ? transaction
            .update(researchReports)
            .set({
              expiresAt: input.expiresAt ?? null,
              markdown: input.markdown,
              state: input.state,
              title: input.title,
              updatedAt: now,
            })
            .where(eq(researchReports.id, input.id))
            .returning()
            .get()
        : transaction
            .insert(researchReports)
            .values({
              createdAt: now,
              expiresAt: input.expiresAt ?? null,
              markdown: input.markdown,
              state: input.state,
              title: input.title,
              updatedAt: now,
            })
            .returning()
            .get();
      if (!row) {
        return null;
      }
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: input.id ? "update-research-report" : "create-research-report",
          reason: input.reason,
          subject: input.title,
        })
        .run();
      return toResearchReport(row);
    });
  }

  public deleteResearchReport(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): boolean {
    const existing = this.#database
      .select({ title: researchReports.title })
      .from(researchReports)
      .where(eq(researchReports.id, input.id))
      .get();
    if (!existing) {
      return false;
    }
    const now = new Date().toISOString();
    this.#database.transaction((transaction) => {
      transaction.delete(researchReports).where(eq(researchReports.id, input.id)).run();
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: "delete-research-report",
          reason: input.reason,
          subject: existing.title,
        })
        .run();
    });
    return true;
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

  public listJobPostings(): JobPosting[] {
    const sourceRows = this.#database
      .select()
      .from(jobPostingSources)
      .orderBy(asc(jobPostingSources.platformId), asc(jobPostingSources.id))
      .all();
    const engagementRows = this.#listJobSourceEngagements(sourceRows.map(({ id }) => id));
    return this.#database
      .select()
      .from(jobPostings)
      .orderBy(desc(jobPostings.updatedAt), asc(jobPostings.title))
      .all()
      .map((job) => toJobPosting(job, sourceRows, engagementRows));
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
      this.saveJobCardObservation({
        initiatedBy: input.initiatedBy,
        observation,
        reason: input.reason,
      });
      const identityKey = jobPostingSourceIdentityKey(observation);
      const source = this.#database
        .select({ id: jobPostingSources.id })
        .from(jobPostingSources)
        .where(
          and(
            eq(jobPostingSources.platformId, snapshot.platformId),
            eq(jobPostingSources.identityKey, identityKey),
          ),
        )
        .get();
      if (!source) {
        throw new Error(`找不到刚保存的岗位来源：${job.title}`);
      }
      sourceIds.push(source.id);
    }
    return sourceIds;
  }

  // eslint-disable-next-line max-lines-per-function -- One private boundary keeps the atomic relation replacement visible.
  #synchronizeEngagementRelations(
    input: {
      initiatedBy: "agent" | "system" | "user";
      reason: string;
      snapshot: JobEngagementSnapshot;
    },
    sourceIds: number[],
  ): SynchronizeJobEngagementResult {
    const { snapshot } = input;
    // eslint-disable-next-line max-lines-per-function -- One transaction owns relation replacement and attribution.
    return this.#database.transaction((transaction) => {
      const platformSourceIds = transaction
        .select({ id: jobPostingSources.id })
        .from(jobPostingSources)
        .where(eq(jobPostingSources.platformId, snapshot.platformId));
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
      let created = false;
      for (const sourceId of sourceIds) {
        const existing = existingRows.find((row) => row.sourceId === sourceId);
        created ||= !existing;
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
      let removed = emptyCount;
      if (snapshot.complete && snapshot.engagement === "interested") {
        const removalCondition =
          sourceIds.length === emptyCollectionLength
            ? and(
                inArray(jobSourceEngagements.sourceId, platformSourceIds),
                eq(jobSourceEngagements.kind, snapshot.engagement),
              )
            : and(
                inArray(jobSourceEngagements.sourceId, platformSourceIds),
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
      if (created || removed > emptyCount) {
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

  public listJobPostingPage(input: JobLibraryQuery): JobPostingPage {
    const condition = this.#jobPageCondition(input);
    const total =
      this.#database.select({ value: count() }).from(jobPostings).where(condition).get()?.value ??
      emptyCount;
    const pageCount = Math.max(firstPage, Math.ceil(total / input.pageSize));
    const rows = this.#database
      .select()
      .from(jobPostings)
      .where(condition)
      .orderBy(desc(jobPostings.updatedAt), asc(jobPostings.title))
      .limit(input.pageSize)
      .offset((input.page - firstPage) * input.pageSize)
      .all();
    const sourceRows = this.#listJobPostingSources(rows.map(({ id }) => id));
    const engagementRows = this.#listJobSourceEngagements(sourceRows.map(({ id }) => id));
    return {
      jobs: rows.map((job) => toJobPosting(job, sourceRows, engagementRows)),
      page: input.page,
      pageCount,
      pageSize: input.pageSize,
      total,
    };
  }

  #jobPageCondition(input: JobLibraryQuery) {
    const conditions = [];
    if (input.query) {
      const pattern = `%${input.query}%`;
      conditions.push(
        or(
          like(jobPostings.title, pattern),
          like(jobPostings.company, pattern),
          like(jobPostings.location, pattern),
          like(jobPostings.description, pattern),
          like(jobPostings.summary, pattern),
          like(jobPostings.details, pattern),
        ),
      );
    }
    if (input.engagement) {
      const sourceIdsWithEngagement = this.#database
        .select({ sourceId: jobSourceEngagements.sourceId })
        .from(jobSourceEngagements)
        .where(eq(jobSourceEngagements.kind, input.engagement));
      const sourceCondition = input.platformId
        ? and(
            inArray(jobPostingSources.id, sourceIdsWithEngagement),
            eq(jobPostingSources.platformId, input.platformId),
          )
        : inArray(jobPostingSources.id, sourceIdsWithEngagement);
      const jobIdsWithEngagement = this.#database
        .select({ jobId: jobPostingSources.jobId })
        .from(jobPostingSources)
        .where(sourceCondition);
      conditions.push(inArray(jobPostings.id, jobIdsWithEngagement));
    } else if (input.platformId) {
      const platformJobIds = this.#database
        .select({ jobId: jobPostingSources.jobId })
        .from(jobPostingSources)
        .where(eq(jobPostingSources.platformId, input.platformId));
      conditions.push(inArray(jobPostings.id, platformJobIds));
    }
    return and(...conditions);
  }

  #listJobPostingSources(jobIds: number[]): JobPostingSourceRow[] {
    if (jobIds.length === emptyCollectionLength) {
      return [];
    }
    return this.#database
      .select()
      .from(jobPostingSources)
      .where(inArray(jobPostingSources.jobId, jobIds))
      .orderBy(asc(jobPostingSources.platformId), asc(jobPostingSources.id))
      .all();
  }

  #listJobSourceEngagements(sourceIds: number[]): JobSourceEngagementRow[] {
    if (sourceIds.length === emptyCollectionLength) {
      return [];
    }
    return this.#database
      .select()
      .from(jobSourceEngagements)
      .where(inArray(jobSourceEngagements.sourceId, sourceIds))
      .all();
  }

  #readJobPosting(jobId: number): JobPosting | null {
    const job = this.#database.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    if (!job) {
      return null;
    }
    const sourceRows = this.#listJobPostingSources([jobId]);
    return toJobPosting(
      job,
      sourceRows,
      this.#listJobSourceEngagements(sourceRows.map(({ id }) => id)),
    );
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
    const existingSource = this.#findJobPostingSource(
      cardObservation.platformId,
      sourceIdentityKey,
    );
    const observedAt = observationTime(input);
    if (existingSource && observationMatches(existingSource, input)) {
      this.#database
        .update(jobPostingSources)
        .set({ lastCheckedAt: observedAt })
        .where(eq(jobPostingSources.id, existingSource.id))
        .run();
      const job = this.#readJobPosting(existingSource.jobId);
      if (!job) {
        throw new Error(`找不到岗位：${String(existingSource.jobId)}`);
      }
      return { job, outcome: "unchanged" };
    }

    const sourceObservations = updatedSourceObservations(existingSource, input);
    const now = new Date().toISOString();
    const result = this.#persistJobObservation({
      cardObservation,
      existingSource,
      now,
      observedAt,
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
    const job = this.#readJobPosting(result.jobId);
    if (!job) {
      throw new Error(`保存后无法读取岗位：${String(result.jobId)}`);
    }
    return { job, outcome: result.outcome };
  }

  #findJobPostingSource(platformId: string, identityKey: string) {
    return this.#database
      .select()
      .from(jobPostingSources)
      .where(
        and(
          eq(jobPostingSources.platformId, platformId),
          eq(jobPostingSources.identityKey, identityKey),
        ),
      )
      .get();
  }

  #persistJobObservation(input: {
    cardObservation: JobCardObservation;
    existingSource: JobPostingSourceRow | undefined;
    sourceObservations: SourceObservations;
    now: string;
    observedAt: string;
    sourceIdentityKey: string;
  }) {
    return this.#database.transaction((transaction) => {
      if (input.existingSource) {
        const { id, jobId } = input.existingSource;
        transaction
          .update(jobPostingSources)
          .set({ ...input.sourceObservations, lastCheckedAt: input.observedAt })
          .where(eq(jobPostingSources.id, id))
          .run();
        WorkspaceRepository.#refreshCanonicalJob(transaction, jobId, input.now);
        return { jobId, outcome: "source-updated" as const };
      }
      const existingJob = transaction
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.identityKey, jobPostingIdentityKey(input.cardObservation)))
        .get();
      if (existingJob) {
        WorkspaceRepository.#insertJobSource(transaction, existingJob.id, input);
        WorkspaceRepository.#refreshCanonicalJob(transaction, existingJob.id, input.now);
        return { jobId: existingJob.id, outcome: "source-added" as const };
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
      WorkspaceRepository.#insertJobSource(transaction, jobId, input);
      return { jobId, outcome: "created" as const };
    });
  }

  static #insertJobSource(
    transaction: WorkspaceTransaction,
    jobId: number,
    input: {
      cardObservation: JobCardObservation;
      sourceObservations: SourceObservations;
      observedAt: string;
      sourceIdentityKey: string;
    },
  ): void {
    transaction
      .insert(jobPostingSources)
      .values({
        ...input.sourceObservations,
        identityKey: input.sourceIdentityKey,
        jobId,
        lastCheckedAt: input.observedAt,
        platformId: input.cardObservation.platformId,
      })
      .run();
  }

  static #refreshCanonicalJob(
    transaction: WorkspaceTransaction,
    jobId: number,
    updatedAt: string,
  ): void {
    const currentSources = transaction
      .select()
      .from(jobPostingSources)
      .where(eq(jobPostingSources.jobId, jobId))
      .all()
      .map((source) => jobSourceEvidence(source.cardObservation, source.descriptionObservation));
    transaction
      .update(jobPostings)
      .set({ ...canonicalJobPostingValues(currentSources), updatedAt })
      .where(eq(jobPostings.id, jobId))
      .run();
  }

  public createProfileFact(input: {
    confirmed: boolean;
    initiatedBy: "agent" | "system" | "user";
    key: string;
    reason: string;
    source: string;
    value: string;
  }): ProfileFact {
    const now = new Date().toISOString();
    return this.#database.transaction((transaction) => {
      const created = transaction
        .insert(profileFacts)
        .values({
          confirmed: input.confirmed,
          key: input.key,
          source: input.source,
          updatedAt: now,
          value: input.value,
        })
        .returning()
        .get();
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: "create-profile-fact",
          reason: input.reason,
          subject: input.key,
        })
        .run();
      return created;
    });
  }

  public updateProfileFact(input: {
    confirmed: boolean;
    id: number;
    initiatedBy: "agent" | "system" | "user";
    key: string;
    reason: string;
    source: string;
    value: string;
  }): ProfileFact | null {
    const now = new Date().toISOString();
    return this.#database.transaction((transaction) => {
      const updated = transaction
        .update(profileFacts)
        .set({
          confirmed: input.confirmed,
          key: input.key,
          source: input.source,
          updatedAt: now,
          value: input.value,
        })
        .where(eq(profileFacts.id, input.id))
        .returning()
        .get();
      if (!updated) {
        return null;
      }
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: "update-profile-fact",
          reason: input.reason,
          subject: input.key,
        })
        .run();
      return updated;
    });
  }

  // eslint-disable-next-line max-lines-per-function -- One transaction replaces the intent and its owned source set.
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
    // eslint-disable-next-line max-lines-per-function -- The callback is the atomic aggregate write.
    const savedId = this.#database.transaction((transaction) => {
      if (input.selected) {
        transaction.update(jobSearchIntents).set({ selected: false }).run();
      }
      const intentId = (() => {
        if (existingId === null) {
          return transaction
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
        }
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
          throw new Error(`找不到求职方向：${String(existingId)}`);
        }
        transaction
          .delete(jobSearchIntentRecommendationPages)
          .where(eq(jobSearchIntentRecommendationPages.intentId, updated.id))
          .run();
        return updated.id;
      })();
      transaction
        .insert(jobSearchIntentRecommendationPages)
        .values(
          input.recommendationPages.map((page) => ({
            intentId,
            label: page.label,
            platformId: page.platformId,
            updatedAt: now,
            url: page.url,
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
      throw new Error(`保存后无法读取求职方向：${String(savedId)}`);
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
        throw new Error(`找不到求职方向：${String(input.id)}`);
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
