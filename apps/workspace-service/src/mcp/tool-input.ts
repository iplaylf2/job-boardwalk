import { inputValidationError, SaveResearchReportCommand } from "@job-boardwalk/contracts";
import { platformIds, platformJobEngagementKinds } from "@job-boardwalk/platform-catalog";
import type { ResearchReportFilter } from "@job-boardwalk/contracts";

import { defaultJobPageSize, firstJobPage, maximumJobPageSize } from "#/job-library/query.js";
import type { JobLibraryQuery } from "#/job-library/query.js";
import { toolInput } from "#/mcp/contract.js";

const PlatformId = toolInput.enumerated(...platformIds);
const JobEngagementFilter = toolInput.enumerated("tracked", ...platformJobEngagementKinds);
const JobDescriptionStatusFilter = toolInput.enumerated(
  "captured",
  "missing",
  "identity-unresolved",
);

export const ReadWorkspaceOverviewInput = toolInput({});
export const ListResearchReportsInput = toolInput({
  "includeExpired?": "boolean",
});

export const ReadResearchReportInput = toolInput({
  id: "number.integer >= 1",
  "includeExpired?": "boolean",
});

export const ReadJobLibraryInput = toolInput({
  "descriptionStatus?": JobDescriptionStatusFilter,
  "engagement?": JobEngagementFilter,
  page: `number.integer >= ${firstJobPage} = ${firstJobPage}`,
  pageSize: `${firstJobPage} <= number.integer <= ${maximumJobPageSize} = ${defaultJobPageSize}`,
  "platformId?": PlatformId,
  "query?": "string",
});

export const SaveResearchReportInput = toolInput({
  "expiresAt?": "string",
  "id?": "number.integer >= 1",
  initiatedBy: "'agent' | 'system' | 'user'",
  markdown: "string > 0",
  reason: "string.trim.preformatted > 0",
  state: "'complete' | 'draft'",
  title: "string.trim.preformatted > 0",
});

function assertToolInput<Value>(validate: () => Value): Value {
  try {
    return validate();
  } catch (error) {
    if (
      error instanceof Error &&
      "arkErrors" in error &&
      error.arkErrors instanceof toolInput.errors
    ) {
      throw inputValidationError(error.arkErrors);
    }
    throw error;
  }
}

export function parseWorkspaceOverviewInput(input: Record<string, unknown>): void {
  assertToolInput(() => ReadWorkspaceOverviewInput.assert(input));
}

export function parseListResearchReportsInput(
  input: Record<string, unknown>,
): ResearchReportFilter {
  return assertToolInput(() => ListResearchReportsInput.assert(input));
}

export function parseReadResearchReportInput(input: Record<string, unknown>): {
  id: number;
  includeExpired?: boolean;
} {
  return assertToolInput(() => ReadResearchReportInput.assert(input));
}

export function parseSaveResearchReportInput(
  input: Record<string, unknown>,
): SaveResearchReportCommand & { id?: number } {
  const parsed = assertToolInput(() => SaveResearchReportInput.assert(input));
  const { id, ...commandInput } = parsed;
  const command = assertToolInput(() => SaveResearchReportCommand.assert(commandInput));
  return { ...command, ...(id ? { id } : {}) };
}

export function parseJobLibraryInput(input: Record<string, unknown>): JobLibraryQuery {
  const parsed = assertToolInput(() => ReadJobLibraryInput.assert(input));
  const { query, ...filters } = parsed;
  const normalizedQuery = query?.trim();
  return {
    ...filters,
    ...(normalizedQuery ? { query: normalizedQuery } : {}),
  };
}
