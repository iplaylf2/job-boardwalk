import type { JobPostingObservation } from "@job-boardwalk/contracts";
import {
  isPlatformId,
  parsePlatformWebUrl,
  platformCatalog,
} from "@job-boardwalk/platform-catalog";

import {
  InvalidRequestError,
  readOptionalString,
  readRequiredArray,
  readRequiredString,
} from "#/http/request.js";

const emptyCollectionLength = 0;

function readIsoTimestamp(input: Record<string, unknown>, key: string): string {
  const value = readRequiredString(input, key);
  if (Number.isNaN(Date.parse(value))) {
    throw new InvalidRequestError(`${key} 必须是有效时间`);
  }
  return value;
}

function readStringArray(input: Record<string, unknown>, key: string): string[] {
  const values = readRequiredArray(input, key);
  const parsed = values.map((value, index) => {
    if (typeof value !== "string" || value.trim().length === emptyCollectionLength) {
      throw new InvalidRequestError(`${key}[${String(index)}] 必须是非空字符串`);
    }
    return value.trim();
  });
  return [...new Set(parsed)];
}

function readPlatformUrl(value: string, platformId: JobPostingObservation["platformId"]): string {
  const url = parsePlatformWebUrl(platformId, value);
  if (!url) {
    throw new InvalidRequestError(
      `岗位来源 URL 必须属于${platformCatalog[platformId].label}的 HTTPS 范围`,
    );
  }
  url.hash = "";
  return url.href;
}

export function parseJobPostingObservation(input: Record<string, unknown>): JobPostingObservation {
  const platformIdValue = readRequiredString(input, "platformId");
  if (!isPlatformId(platformIdValue)) {
    throw new InvalidRequestError("platformId 不是受支持的招聘平台");
  }
  const company = readOptionalString(input, "company");
  const educationRequirement = readOptionalString(input, "educationRequirement");
  const experienceRequirement = readOptionalString(input, "experienceRequirement");
  const externalJobId = readOptionalString(input, "externalJobId");
  const location = readOptionalString(input, "location");
  const salaryText = readOptionalString(input, "salaryText");
  return {
    collectedAt: readIsoTimestamp(input, "collectedAt"),
    ...(company ? { company } : {}),
    details: readStringArray(input, "details"),
    discoveryUrl: readPlatformUrl(readRequiredString(input, "discoveryUrl"), platformIdValue),
    ...(educationRequirement ? { educationRequirement } : {}),
    ...(experienceRequirement ? { experienceRequirement } : {}),
    ...(externalJobId ? { externalJobId } : {}),
    jobUrl: readPlatformUrl(readRequiredString(input, "jobUrl"), platformIdValue),
    ...(location ? { location } : {}),
    platformId: platformIdValue,
    ...(salaryText ? { salaryText } : {}),
    summary: readRequiredString(input, "summary"),
    title: readRequiredString(input, "title"),
  };
}
