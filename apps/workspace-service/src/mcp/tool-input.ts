import { platformIds } from "@job-boardwalk/platform-catalog";

import {
  defaultJobPageSize,
  firstJobPage,
  maximumJobPageSize,
} from "#/job-posting/library-query.js";
import type { JobLibraryQuery } from "#/job-posting/library-query.js";
import { toolInput } from "#/mcp/contract.js";

const PlatformId = toolInput.enumerated(...platformIds);

export const ReadWorkspaceOverviewInput = toolInput({});

export const ReadJobLibraryInput = toolInput({
  page: `number.integer >= ${firstJobPage} = ${firstJobPage}`,
  pageSize: `${firstJobPage} <= number.integer <= ${maximumJobPageSize} = ${defaultJobPageSize}`,
  "platformId?": PlatformId,
  "query?": "string",
});

function assertToolInput<Value>(validate: () => Value): Value {
  try {
    return validate();
  } catch (error) {
    throw new TypeError(error instanceof Error ? error.message : String(error), { cause: error });
  }
}

export function parseWorkspaceOverviewInput(input: Record<string, unknown>): void {
  assertToolInput(() => ReadWorkspaceOverviewInput.assert(input));
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
