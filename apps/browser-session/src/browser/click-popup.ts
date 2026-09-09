import type { Locator, Page } from "patchright";
import { completer, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

const popupObservationMilliseconds = 1000;

export function* clickAndCapturePopup(page: Page, locator: Locator): RiteCoroutine<Page | null> {
  const popup = yield* completer<Page>();
  function capturePopup(popupPage: Page): void {
    popup.resolve(popupPage);
  }
  page.on("popup", capturePopup);
  try {
    yield* until(() => locator.click());
    // A popup event can arrive after the driver's click promise has resolved.
    return yield* race([
      () => wait(popup.future),
      function* observeNoPopup() {
        yield* sleep(popupObservationMilliseconds);
        return null;
      },
    ]);
  } finally {
    page.off("popup", capturePopup);
  }
}
