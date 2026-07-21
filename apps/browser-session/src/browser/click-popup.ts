import type { Locator, Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export function* clickAndCapturePopup(page: Page, locator: Locator): RiteCoroutine<Page | null> {
  const captured = { page: null as Page | null };
  function capturePopup(popupPage: Page): void {
    captured.page = popupPage;
  }
  page.on("popup", capturePopup);
  try {
    yield* until(() => locator.click());
  } finally {
    page.off("popup", capturePopup);
  }
  return captured.page;
}
