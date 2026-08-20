import type { Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import { isPatchrightTimeout } from "./patchright-timeout.js";

const pageInspectionTimeoutMilliseconds = 3000;

export type DocumentReadyState = "complete" | "interactive" | "loading";

export type PageInspection =
  | {
      readonly documentReadyState: DocumentReadyState;
      readonly outcome: "observed";
      readonly title: string;
    }
  | { readonly outcome: "page-closed" }
  | { readonly outcome: "timed-out" };

export function* inspectPageDocument(page: Page): RiteCoroutine<PageInspection> {
  if (page.isClosed()) {
    return { outcome: "page-closed" };
  }
  try {
    return yield* until(() =>
      page.locator("html").evaluate(
        (html) => ({
          documentReadyState: html.ownerDocument.readyState,
          outcome: "observed" as const,
          title: html.ownerDocument.title,
        }),
        null,
        { timeout: pageInspectionTimeoutMilliseconds },
      ),
    );
  } catch (error) {
    if (page.isClosed()) {
      return { outcome: "page-closed" };
    }
    if (isPatchrightTimeout(error)) {
      return { outcome: "timed-out" };
    }
    throw error;
  }
}
