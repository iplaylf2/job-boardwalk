import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { JobDescriptionCoverage, JobPosting, JobPostingPage } from "@job-boardwalk/contracts";
import type { JobLibraryQuery } from "#/job-library/query.js";
import { jobPostings, jobPostingSources, jobSourceEngagements } from "./schema.js";
import type { WorkspaceDatabase } from "./database.js";
import type { JobPostingSourceRow, JobSourceEngagementRow } from "./schema.js";
import { toJobPosting } from "./job-posting-mapping.js";

const emptyCollectionLength = 0;

const emptyCount = 0;

const firstPage = 1;
export class JobLibraryRepository {
  readonly #database: WorkspaceDatabase;

  public constructor(database: WorkspaceDatabase) {
    this.#database = database;
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

  public listJobPostingPage(input: JobLibraryQuery): JobPostingPage {
    const scopeCondition = this.#jobScopeCondition(input);
    const descriptionCondition = this.#jobDescriptionCondition(input.descriptionStatus);
    const filteredCondition = and(scopeCondition, descriptionCondition);
    const descriptionCoverage = this.#jobDescriptionCoverage(scopeCondition);
    const total =
      this.#database.select({ value: count() }).from(jobPostings).where(filteredCondition).get()
        ?.value ?? emptyCount;
    const pageCount = Math.max(firstPage, Math.ceil(total / input.pageSize));
    const rows = this.#database
      .select()
      .from(jobPostings)
      .where(filteredCondition)
      .orderBy(desc(jobPostings.updatedAt), asc(jobPostings.title))
      .limit(input.pageSize)
      .offset((input.page - firstPage) * input.pageSize)
      .all();
    const sourceRows = this.#listJobPostingSources(rows.map(({ id }) => id));
    const engagementRows = this.#listJobSourceEngagements(sourceRows.map(({ id }) => id));
    return {
      descriptionCoverage,
      jobs: rows.map((job) => toJobPosting(job, sourceRows, engagementRows)),
      page: input.page,
      pageCount,
      pageSize: input.pageSize,
      total,
    };
  }

  #jobScopeCondition(input: JobLibraryQuery) {
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
      const sourceIdsWithEngagement =
        input.engagement === "tracked"
          ? this.#database
              .selectDistinct({ sourceId: jobSourceEngagements.sourceId })
              .from(jobSourceEngagements)
          : this.#database
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

  #jobDescriptionCondition(status: JobLibraryQuery["descriptionStatus"]) {
    if (!status) {
      return and();
    }
    if (status === "captured") {
      return isNotNull(jobPostings.description);
    }
    if (status === "missing") {
      return isNull(jobPostings.description);
    }
    return this.#jobIdentityUnresolvedCondition();
  }

  #jobIdentityUnresolvedCondition() {
    const identifiableJobIds = this.#database
      .selectDistinct({ jobId: jobPostingSources.jobId })
      .from(jobPostingSources)
      .where(
        or(
          sql`nullif(json_extract(${jobPostingSources.cardObservation}, '$.externalJobId'), '') is not null`,
          sql`nullif(json_extract(${jobPostingSources.cardObservation}, '$.jobUrl'), '') is not null`,
          sql`nullif(json_extract(${jobPostingSources.descriptionObservation}, '$.externalJobId'), '') is not null`,
          sql`nullif(json_extract(${jobPostingSources.descriptionObservation}, '$.jobUrl'), '') is not null`,
        ),
      );
    return and(isNull(jobPostings.description), notInArray(jobPostings.id, identifiableJobIds));
  }

  #jobDescriptionCoverage(scopeCondition: SQL | undefined): JobDescriptionCoverage {
    const identityUnresolvedCondition = this.#jobIdentityUnresolvedCondition();
    const coverage = this.#database
      .select({
        captured: sql<number>`coalesce(sum(case when ${isNotNull(jobPostings.description)} then 1 else 0 end), 0)`,
        identityUnresolved: sql<number>`coalesce(sum(case when ${identityUnresolvedCondition} then 1 else 0 end), 0)`,
        total: count(),
      })
      .from(jobPostings)
      .where(scopeCondition)
      .get() ?? { captured: emptyCount, identityUnresolved: emptyCount, total: emptyCount };
    return {
      ...coverage,
      uncaptured: coverage.total - coverage.captured - coverage.identityUnresolved,
    };
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

  public readJobPosting(jobId: number): JobPosting | null {
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
}
