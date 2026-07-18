import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

// oxlint-disable max-lines -- This class is the cohesive persistence boundary for workspace state.
import { and, asc, count, desc, eq, gt, inArray, isNull, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import type {
  JobPosting,
  JobPostingObservation,
  JobPostingPage,
  JobPostingSource,
  JobSearchIntent,
  RecommendationPageReference,
  PlatformAccessObservation,
  ProfileFact,
  ResearchReport,
  ResearchReportSummary,
  RecordedPlatformAccessObservation,
  SaveJobPostingObservationResult,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";

import { normalizeJobPostingSalary } from "#/job-posting/salary.js";
import type { JobLibraryQuery } from "#/job-posting/library-query.js";

import {
  jobPostings,
  jobPostingSources,
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
type ResearchReportRow = typeof researchReports.$inferSelect;
type NonEmptyJobPostingObservations = [JobPostingObservation, ...JobPostingObservation[]];
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

function jobPostingIdentityKey(observation: JobPostingObservation): string {
  if (!observation.company || !observation.location) {
    return hashValue([observation.platformId, observation.externalJobId ?? observation.jobUrl]);
  }
  return hashValue([
    normalizedCompanyIdentity(observation.company),
    normalizedIdentityPart(observation.title.replaceAll(/[【[][^】\]]+[】\]]/gu, "")),
    normalizedIdentityPart(observation.location),
  ]);
}

function observationFingerprint(observation: JobPostingObservation): string {
  return hashValue({
    company: observation.company ?? null,
    details: [...new Set(observation.details)].toSorted(),
    educationRequirement: observation.educationRequirement ?? null,
    experienceRequirement: observation.experienceRequirement ?? null,
    location: observation.location ?? null,
    salaryText: observation.salaryText ?? null,
    summary: observation.summary,
    title: observation.title,
  });
}

function toJobPostingSource(row: JobPostingSourceRow): JobPostingSource {
  if (!isPlatformId(row.platformId)) {
    throw new Error(`数据库中存在未知招聘平台：${row.platformId}`);
  }
  return {
    collectedAt: row.collectedAt,
    ...(row.company ? { company: row.company } : {}),
    details: row.details,
    discoveryUrl: row.discoveryUrl,
    ...(row.educationRequirement ? { educationRequirement: row.educationRequirement } : {}),
    ...(row.experienceRequirement ? { experienceRequirement: row.experienceRequirement } : {}),
    ...(row.externalJobId ? { externalJobId: row.externalJobId } : {}),
    id: row.id,
    jobId: row.jobId,
    jobUrl: row.jobUrl,
    lastCheckedAt: row.lastCheckedAt,
    ...(row.location ? { location: row.location } : {}),
    ...(row.normalizedSalary ? { normalizedSalary: row.normalizedSalary } : {}),
    platformId: row.platformId,
    ...(row.salaryText ? { salaryText: row.salaryText } : {}),
    summary: row.summary,
    title: row.title,
  };
}

function canonicalJobPostingValues(observations: NonEmptyJobPostingObservations) {
  const [firstObservation, ...remainingObservations] = observations;
  let latest = firstObservation;
  for (const observation of remainingObservations) {
    if (observation.collectedAt > latest.collectedAt) {
      latest = observation;
    }
  }
  return {
    company: latest.company ?? null,
    details: [...new Set(observations.flatMap(({ details }) => details))].toSorted(),
    educationRequirement: latest.educationRequirement ?? null,
    experienceRequirement: latest.experienceRequirement ?? null,
    location: latest.location ?? null,
    summary: latest.summary,
    title: latest.title,
  };
}

function jobPostingSourceValues(
  jobId: number,
  observation: JobPostingObservation,
  fingerprint: string,
) {
  return {
    collectedAt: observation.collectedAt,
    company: observation.company ?? null,
    details: [...new Set(observation.details)].toSorted(),
    discoveryUrl: observation.discoveryUrl,
    educationRequirement: observation.educationRequirement ?? null,
    experienceRequirement: observation.experienceRequirement ?? null,
    externalJobId: observation.externalJobId ?? null,
    jobId,
    jobUrl: observation.jobUrl,
    lastCheckedAt: observation.collectedAt,
    location: observation.location ?? null,
    normalizedSalary: normalizeJobPostingSalary(observation.salaryText),
    platformId: observation.platformId,
    salaryText: observation.salaryText ?? null,
    sourceFingerprint: fingerprint,
    summary: observation.summary,
    title: observation.title,
  };
}

function toJobPosting(job: JobPostingRow, sourceRows: JobPostingSourceRow[]): JobPosting {
  return {
    ...(job.company ? { company: job.company } : {}),
    createdAt: job.createdAt,
    details: job.details,
    ...(job.educationRequirement ? { educationRequirement: job.educationRequirement } : {}),
    ...(job.experienceRequirement ? { experienceRequirement: job.experienceRequirement } : {}),
    id: job.id,
    ...(job.location ? { location: job.location } : {}),
    sources: sourceRows.filter((source) => source.jobId === job.id).map(toJobPostingSource),
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
      .orderBy(asc(jobPostingSources.platformId), asc(jobPostingSources.jobUrl))
      .all();
    return this.#database
      .select()
      .from(jobPostings)
      .orderBy(desc(jobPostings.updatedAt), asc(jobPostings.title))
      .all()
      .map((job) => toJobPosting(job, sourceRows));
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
    return {
      jobs: rows.map((job) => toJobPosting(job, sourceRows)),
      page: input.page,
      pageCount,
      pageSize: input.pageSize,
      total,
    };
  }

  #jobPageCondition(input: { platformId?: "boss" | "yupao"; query?: string }) {
    const conditions = [];
    if (input.query) {
      const pattern = `%${input.query}%`;
      conditions.push(
        or(
          like(jobPostings.title, pattern),
          like(jobPostings.company, pattern),
          like(jobPostings.location, pattern),
          like(jobPostings.summary, pattern),
          like(jobPostings.details, pattern),
        ),
      );
    }
    if (input.platformId) {
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
      .orderBy(asc(jobPostingSources.platformId), asc(jobPostingSources.jobUrl))
      .all();
  }

  #readJobPosting(jobId: number): JobPosting | null {
    const job = this.#database.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    return job ? toJobPosting(job, this.#listJobPostingSources([jobId])) : null;
  }

  // eslint-disable-next-line max-lines-per-function -- One transaction owns source deduplication and canonical aggregation.
  public saveJobPostingObservation(input: {
    initiatedBy: "agent" | "system" | "user";
    observation: JobPostingObservation;
    reason: string;
  }): SaveJobPostingObservationResult {
    const { observation } = input;
    const fingerprint = observationFingerprint(observation);
    const identityKey = jobPostingIdentityKey(observation);
    const sourceIdentity = observation.externalJobId
      ? or(
          and(
            eq(jobPostingSources.platformId, observation.platformId),
            eq(jobPostingSources.externalJobId, observation.externalJobId),
          ),
          and(
            eq(jobPostingSources.platformId, observation.platformId),
            eq(jobPostingSources.jobUrl, observation.jobUrl),
          ),
        )
      : and(
          eq(jobPostingSources.platformId, observation.platformId),
          eq(jobPostingSources.jobUrl, observation.jobUrl),
        );
    const existingSource = this.#database
      .select()
      .from(jobPostingSources)
      .where(sourceIdentity)
      .get();
    if (existingSource?.sourceFingerprint === fingerprint) {
      this.#database
        .update(jobPostingSources)
        .set({
          discoveryUrl: observation.discoveryUrl,
          externalJobId: observation.externalJobId ?? null,
          jobUrl: observation.jobUrl,
          lastCheckedAt: observation.collectedAt,
        })
        .where(eq(jobPostingSources.id, existingSource.id))
        .run();
      const job = this.#readJobPosting(existingSource.jobId);
      if (!job) {
        throw new Error(`找不到岗位：${String(existingSource.jobId)}`);
      }
      return { job, outcome: "unchanged" };
    }

    const now = new Date().toISOString();
    // eslint-disable-next-line max-lines-per-function -- The callback atomically chooses the source deduplication outcome.
    const result = this.#database.transaction((transaction) => {
      if (existingSource) {
        const siblingSources = transaction
          .select()
          .from(jobPostingSources)
          .where(eq(jobPostingSources.jobId, existingSource.jobId))
          .all()
          .filter(({ id }) => id !== existingSource.id)
          .map(toJobPostingSource);
        const canonical = canonicalJobPostingValues([observation, ...siblingSources]);
        transaction
          .update(jobPostingSources)
          .set(jobPostingSourceValues(existingSource.jobId, observation, fingerprint))
          .where(eq(jobPostingSources.id, existingSource.id))
          .run();
        transaction
          .update(jobPostings)
          .set({ ...canonical, updatedAt: now })
          .where(eq(jobPostings.id, existingSource.jobId))
          .run();
        return { jobId: existingSource.jobId, outcome: "source-updated" as const };
      }

      const existingJob = transaction
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.identityKey, identityKey))
        .get();
      if (existingJob) {
        const siblingSources = transaction
          .select()
          .from(jobPostingSources)
          .where(eq(jobPostingSources.jobId, existingJob.id))
          .all()
          .map(toJobPostingSource);
        transaction
          .insert(jobPostingSources)
          .values(jobPostingSourceValues(existingJob.id, observation, fingerprint))
          .run();
        transaction
          .update(jobPostings)
          .set({
            ...canonicalJobPostingValues([observation, ...siblingSources]),
            updatedAt: now,
          })
          .where(eq(jobPostings.id, existingJob.id))
          .run();
        return { jobId: existingJob.id, outcome: "source-added" as const };
      }

      const canonical = canonicalJobPostingValues([observation]);
      const jobId = transaction
        .insert(jobPostings)
        .values({
          ...canonical,
          createdAt: now,
          identityKey,
          updatedAt: now,
        })
        .returning({ id: jobPostings.id })
        .get().id;
      transaction
        .insert(jobPostingSources)
        .values(jobPostingSourceValues(jobId, observation, fingerprint))
        .run();
      return { jobId, outcome: "created" as const };
    });
    this.#database
      .insert(workspaceChanges)
      .values({
        initiatedBy: input.initiatedBy,
        occurredAt: now,
        operation: result.outcome,
        reason: input.reason,
        subject: `${observation.company ? `${observation.company} · ` : ""}${observation.title}`,
      })
      .run();
    const job = this.#readJobPosting(result.jobId);
    if (!job) {
      throw new Error(`保存后无法读取岗位：${String(result.jobId)}`);
    }
    return { job, outcome: result.outcome };
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
