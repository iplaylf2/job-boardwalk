import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, exists, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-sqlite";
import type {
  ResearchReport,
  ResearchReportPlatformTarget,
  SaveResearchReportCommand,
  ResearchReportSummary,
  ResearchReportFilter,
  ResearchReportEntry,
  ResearchReportPlatformProgress,
} from "@job-boardwalk/contracts";
import {
  researchReports,
  researchReportEntries,
  researchReportTargets,
  jobPostingSources,
  workspaceChanges,
} from "./schema.js";

const emptyCount = 0;

function createValidationError(message: string): Error {
  const error = new Error(message);
  error.name = "ResearchReportValidationError";
  return error;
}

export function isResearchReportValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === "ResearchReportValidationError";
}

type ReportRow = typeof researchReports.$inferSelect;
function unexpiredResearchReportCondition(now: string) {
  return sql`(${researchReports.expiresAt} is null or ${researchReports.expiresAt} > ${now})`;
}

function derivePlatformProgress(
  targets: readonly ResearchReportPlatformTarget[],
  sourceEntries: readonly (ResearchReportEntry & { platformId: string })[],
): ResearchReportPlatformProgress[] {
  return targets.map((target) => {
    const entries = sourceEntries.filter(({ platformId }) => platformId === target.platformId);
    const recommended = entries.filter(({ disposition }) => disposition === "recommended").length;
    return {
      ...target,
      excluded: entries.filter(({ disposition }) => disposition === "excluded").length,
      pending: entries.filter(({ disposition }) => disposition === "pending").length,
      recommended,
      remaining: Math.max(emptyCount, target.count - recommended),
    };
  });
}

export class ResearchReportRepository {
  readonly #database: ReturnType<typeof drizzle>;
  public constructor(database: ReturnType<typeof drizzle>) {
    this.#database = database;
  }
  public listResearchReports(filter: ResearchReportFilter = {}): ResearchReportSummary[] {
    const conditions: SQL[] = [];
    if (!filter.includeExpired) {
      conditions.push(unexpiredResearchReportCondition(new Date().toISOString()));
    }
    if (filter.sourceId || filter.disposition) {
      const entryConditions = [eq(researchReportEntries.reportId, researchReports.id)];
      if (filter.sourceId) {
        entryConditions.push(eq(researchReportEntries.sourceId, filter.sourceId));
      }
      if (filter.disposition) {
        entryConditions.push(eq(researchReportEntries.disposition, filter.disposition));
      }
      const matchingEntries = this.#database
        .select()
        .from(researchReportEntries)
        .where(and(...entryConditions));
      conditions.push(exists(matchingEntries));
    }
    return this.#database
      .select()
      .from(researchReports)
      .where(and(...conditions))
      .orderBy(desc(researchReports.updatedAt), desc(researchReports.id))
      .all()
      .map((row) => {
        const {
          markdown: _markdown,
          entries: _entries,
          targets: _targets,
          ...summary
        } = this.#read(row);
        return summary;
      });
  }

  public readResearchReport(id: number, includeExpired = false): ResearchReport | null {
    const conditions = [eq(researchReports.id, id)];
    if (!includeExpired) {
      conditions.push(unexpiredResearchReportCondition(new Date().toISOString()));
    }
    const row = this.#database
      .select()
      .from(researchReports)
      .where(and(...conditions))
      .get();
    return row ? this.#read(row) : null;
  }

  // eslint-disable-next-line max-lines-per-function -- One transaction owns report persistence and attribution.
  public saveResearchReport(
    input: SaveResearchReportCommand & { id?: number },
  ): ResearchReport | null {
    if (new Set(input.entries.map(({ sourceId }) => sourceId)).size !== input.entries.length) {
      throw createValidationError("报告中同一平台来源只能有一个结论");
    }
    if (new Set(input.targets.map(({ platformId }) => platformId)).size !== input.targets.length) {
      throw createValidationError("报告中同一平台只能有一个目标");
    }
    const now = new Date().toISOString();
    // eslint-disable-next-line max-lines-per-function -- The transaction replaces report content, source judgments, targets, and attribution atomically.
    return this.#database.transaction((transaction) => {
      for (const entry of input.entries) {
        if (
          !transaction
            .select({ id: jobPostingSources.id })
            .from(jobPostingSources)
            .where(eq(jobPostingSources.id, entry.sourceId))
            .get()
        ) {
          throw createValidationError(`找不到岗位来源 ${String(entry.sourceId)}`);
        }
      }
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
        .delete(researchReportEntries)
        .where(eq(researchReportEntries.reportId, row.id))
        .run();
      transaction
        .delete(researchReportTargets)
        .where(eq(researchReportTargets.reportId, row.id))
        .run();
      if (input.entries.length > emptyCount) {
        transaction
          .insert(researchReportEntries)
          .values(input.entries.map((entry) => ({ ...entry, reportId: row.id })))
          .run();
      }
      if (input.targets.length > emptyCount) {
        transaction
          .insert(researchReportTargets)
          .values(input.targets.map((target) => ({ ...target, reportId: row.id })))
          .run();
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
      return this.#read(row);
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

  #read(row: ReportRow): ResearchReport {
    const rows = this.#database
      .select({
        assessedAt: researchReportEntries.assessedAt,
        basis: researchReportEntries.basis,
        disposition: researchReportEntries.disposition,
        platformId: jobPostingSources.platformId,
        sourceId: researchReportEntries.sourceId,
      })
      .from(researchReportEntries)
      .innerJoin(jobPostingSources, eq(researchReportEntries.sourceId, jobPostingSources.id))
      .where(eq(researchReportEntries.reportId, row.id))
      .orderBy(asc(researchReportEntries.sourceId))
      .all();
    const targets = this.#database
      .select()
      .from(researchReportTargets)
      .where(eq(researchReportTargets.reportId, row.id))
      .orderBy(asc(researchReportTargets.platformId))
      .all()
      .map(({ count, nextStep, platformId }) =>
        nextStep ? { count, nextStep, platformId } : { count, platformId },
      );
    return {
      createdAt: row.createdAt,
      ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
      entries: rows.map(({ platformId: _platformId, ...entry }) => entry),
      id: row.id,
      markdown: row.markdown,
      progress: derivePlatformProgress(targets, rows),
      state: row.state,
      targets,
      title: row.title,
      updatedAt: row.updatedAt,
    };
  }
}
