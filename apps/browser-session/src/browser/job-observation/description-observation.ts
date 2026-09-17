import { OperationError } from "@job-boardwalk/contracts";
import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { JobDescriptionObservation } from "@job-boardwalk/contracts";

import { extractExternalJobId } from "#/browser/platform-job-links.js";
import { requireJobDetailExtractionConfigs } from "#/browser/recruiting-platform-adapters.js";
import type { PageAccessFacts } from "#/browser/platforms/types.js";
import { captureJobDescriptionMetadata } from "./description-page-capture.js";

const accessTextCharacters = 5000;
const maximumAccessElements = 300;
const maximumDescriptionCharacters = 20_000;
const maximumFieldCharacters = 300;

// eslint-disable-next-line max-lines-per-function -- Validation and contract mapping stay beside the single page read.
export function* captureJobDescriptionObservation(
  page: Page,
  observePageAccess?: (page: PageAccessFacts) => void,
): RiteCoroutine<JobDescriptionObservation> {
  const initialUrl = page.url();
  const { cardConfig, descriptionConfig, platformId } =
    requireJobDetailExtractionConfigs(initialUrl);
  const metadata = yield* until(() =>
    page.evaluate(captureJobDescriptionMetadata, {
      accessTextCharacters,
      cardConfig,
      descriptionConfig,
      maximumAccessElements,
      maximumDescriptionCharacters,
      maximumFieldCharacters,
    }),
  );
  if (metadata.url !== initialUrl) {
    throw new OperationError(
      "page-changed",
      "当前岗位详情页在读取期间发生了导航；请等待页面稳定后重试。",
      {},
    );
  }
  observePageAccess?.({
    elements: metadata.accessElements,
    text: metadata.accessText,
    url: metadata.url,
  });
  if (!metadata.title || !metadata.description) {
    const missing = [
      ...(metadata.title ? [] : ["岗位标题"]),
      ...(metadata.description ? [] : ["职位描述"]),
    ].join("、");
    throw new OperationError(
      "evidence-unavailable",
      `未能提取${missing}；页面正文${metadata.accessText.trim() ? "可读" : "为空"}。请用 browser_snapshot 核对页面内容。`,
      {
        missingFields: [
          ...(metadata.title ? [] : ["title"]),
          ...(metadata.description ? [] : ["description"]),
        ],
        pageTextAvailable: Boolean(metadata.accessText.trim()),
        url: metadata.url,
      },
    );
  }
  const capturedAt = new Date().toISOString();
  const externalJobId = extractExternalJobId(platformId, metadata.url);
  return {
    observedAt: capturedAt,
    ...(metadata.company ? { company: metadata.company } : {}),
    description: {
      capturedAt,
      text: metadata.description,
      truncated: metadata.truncated,
    },
    details: metadata.details,
    ...(metadata.educationRequirement
      ? { educationRequirement: metadata.educationRequirement }
      : {}),
    ...(metadata.experienceRequirement
      ? { experienceRequirement: metadata.experienceRequirement }
      : {}),
    ...(externalJobId ? { externalJobId } : {}),
    jobUrl: metadata.url,
    ...(metadata.location ? { location: metadata.location } : {}),
    platformId,
    recruitment: {
      ...(metadata.recruitmentClosure
        ? { evidence: metadata.recruitmentClosure, state: "closed" }
        : { state: "unknown" }),
      observedAt: capturedAt,
      url: metadata.url,
    },
    ...(metadata.salaryText ? { salaryText: metadata.salaryText } : {}),
    title: metadata.title,
  };
}
