import { and, desc, eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-sqlite";
import type {
  ResearchReport,
  SaveResearchReportCommand,
  ResearchReportSummary,
  ResearchReportFilter,
} from "@job-boardwalk/contracts";
import { researchReports, workspaceChanges } from "./schema.js";

type ReportRow = typeof researchReports.$inferSelect;
function unexpiredResearchReportCondition(now: string) {
  return sql`(${researchReports.expiresAt} is null or ${researchReports.expiresAt} > ${now})`;
}

function reportFromRow(row: ReportRow): ResearchReport {
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

export class ResearchReportRepository {
  readonly #database: ReturnType<typeof drizzle>;
  public constructor(database: ReturnType<typeof drizzle>) {
    this.#database = database;
  }
  public listResearchReports(filter: ResearchReportFilter = {}): ResearchReportSummary[] {
    const conditions = filter.includeExpired
      ? []
      : [unexpiredResearchReportCondition(new Date().toISOString())];
    return this.#database
      .select()
      .from(researchReports)
      .where(and(...conditions))
      .orderBy(desc(researchReports.updatedAt), desc(researchReports.id))
      .all()
      .map((row) => {
        const { markdown: _markdown, ...summary } = reportFromRow(row);
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
    return row ? reportFromRow(row) : null;
  }

  public saveResearchReport(
    input: SaveResearchReportCommand & { id?: number },
  ): ResearchReport | null {
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
      return reportFromRow(row);
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
}
