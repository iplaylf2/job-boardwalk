import { isPlatformId, platformIds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

export const firstJobPage = 1;
export const defaultJobPageSize = 24;
export const maximumJobPageSize = 48;

const jobLibraryQueryKeys = new Set(["page", "pageSize", "platformId", "query"]);

export class InvalidJobLibraryQueryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidJobLibraryQueryError";
  }
}

export interface JobLibraryQuery {
  page: number;
  pageSize: number;
  platformId?: PlatformId;
  query?: string;
}

function positiveInteger(input: {
  fallback: number;
  hasValue: boolean;
  maximum?: number;
  name: string;
  value: unknown;
}): number {
  const { fallback, hasValue, maximum = null, name, value } = input;
  if (!hasValue) {
    return fallback;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < firstJobPage ||
    (maximum !== null && value > maximum)
  ) {
    const upperBound = maximum === null ? "" : `且不能超过 ${String(maximum)}`;
    throw new InvalidJobLibraryQueryError(`${name} 必须是正整数${upperBound}`);
  }
  return value;
}

export function parseJobLibraryQuery(input: Record<string, unknown>): JobLibraryQuery {
  for (const key of Object.keys(input)) {
    if (!jobLibraryQueryKeys.has(key)) {
      throw new InvalidJobLibraryQueryError(`岗位库查询不支持参数：${key}`);
    }
  }
  const { page: pageValue, pageSize: pageSizeValue, platformId, query } = input;
  const page = positiveInteger({
    fallback: firstJobPage,
    hasValue: "page" in input,
    name: "page",
    value: pageValue,
  });
  const pageSize = positiveInteger({
    fallback: defaultJobPageSize,
    hasValue: "pageSize" in input,
    maximum: maximumJobPageSize,
    name: "pageSize",
    value: pageSizeValue,
  });
  if ("platformId" in input && (typeof platformId !== "string" || !isPlatformId(platformId))) {
    throw new InvalidJobLibraryQueryError(
      `platformId 必须是受支持的招聘平台：${platformIds.join("、")}`,
    );
  }
  if ("query" in input && typeof query !== "string") {
    throw new InvalidJobLibraryQueryError("query 必须是字符串");
  }
  return {
    page,
    pageSize,
    ...(typeof platformId === "string" && isPlatformId(platformId) ? { platformId } : {}),
    ...(typeof query === "string" && query.trim() ? { query: query.trim() } : {}),
  };
}
