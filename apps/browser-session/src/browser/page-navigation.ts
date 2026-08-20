import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

import { inspectPageDocument } from "./page-inspection.js";
import type { PageInspection } from "./page-inspection.js";
import { isPatchrightTimeout } from "./patchright-timeout.js";
import {
  findRecruitingPlatformAdapter,
  requireRecruitingPlatformAdapter,
} from "./recruiting-platform-adapters.js";

const navigationTimeoutMilliseconds = 30_000;
const navigationWaitUntil = "domcontentloaded" as const;

interface PageNavigationSummary {
  readonly pageInspection: PageInspection;
  readonly platformId: PlatformId;
  readonly title?: string;
  readonly url: string;
}

interface TimedOutNavigationResult {
  readonly navigation: {
    readonly outcome: "timed-out";
    readonly waitUntil: typeof navigationWaitUntil;
  };
  readonly pageInspection: PageInspection;
  readonly platformId: PlatformId;
  readonly requestedUrl: string;
  readonly url: string;
}

export type NavigationResult =
  | (PageNavigationSummary & {
      readonly navigation:
        | { readonly outcome: "already-current" }
        | {
            readonly outcome: "completed";
            readonly waitUntil: typeof navigationWaitUntil;
          };
      readonly requestedUrl: string;
    })
  | TimedOutNavigationResult;

export function* readNavigationPageSummary(page: Page): RiteCoroutine<PageNavigationSummary> {
  const url = page.url();
  const { platformId } = requireRecruitingPlatformAdapter(url);
  const pageInspection = yield* inspectPageDocument(page);
  return {
    pageInspection,
    platformId,
    ...(pageInspection.outcome === "observed" ? { title: pageInspection.title } : {}),
    url,
  };
}

export function* navigatePage(page: Page, requestedUrl: string): RiteCoroutine<NavigationResult> {
  try {
    yield* until(() =>
      page.goto(requestedUrl, {
        timeout: navigationTimeoutMilliseconds,
        waitUntil: navigationWaitUntil,
      }),
    );
  } catch (error) {
    if (!isPatchrightTimeout(error)) {
      throw error;
    }
    const url = page.url();
    const adapter = findRecruitingPlatformAdapter(url);
    const requestedAdapter = requireRecruitingPlatformAdapter(requestedUrl);
    return {
      navigation: {
        outcome: "timed-out",
        waitUntil: navigationWaitUntil,
      },
      pageInspection: yield* inspectPageDocument(page),
      platformId: adapter?.platformId ?? requestedAdapter.platformId,
      requestedUrl,
      url,
    };
  }
  return {
    ...(yield* readNavigationPageSummary(page)),
    navigation: { outcome: "completed", waitUntil: navigationWaitUntil },
    requestedUrl,
  };
}
