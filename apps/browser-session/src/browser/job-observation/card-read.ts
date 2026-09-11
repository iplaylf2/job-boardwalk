import type { Page } from "patchright";
import type { JobCardSnapshot } from "@job-boardwalk/contracts";
import { sleep } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race } from "@shajara/host/primitives";
import type { PageAccessFacts } from "#/browser/platforms/types.js";
import { captureJobCardSnapshot } from "./card-snapshot.js";

// Service resource policy; these limits bound a read, not the platform's loading time or result set.
const maxCards = 100;
const readBudgetMs = 5000;
const pollIntervalMs = 250;
const noCards = 0;

type ReadResult = JobCardSnapshot & { outcome: "cards-observed" | "no-cards-observed" };

export function* readJobCards(
  page: Page,
  waitFor: "none" | "cards-present",
  observePageAccess: (page: PageAccessFacts) => void,
): RiteCoroutine<ReadResult> {
  let latest: JobCardSnapshot | null = null;
  const initialUrl = page.url();
  function requireOriginalUrl(): void {
    if (page.url() !== initialUrl) {
      throw new Error("等待岗位卡片期间页面发生导航；请重新观察当前页面。");
    }
  }
  return yield* race([
    function* observeCards(): RiteCoroutine<ReadResult> {
      while (true) {
        requireOriginalUrl();
        latest = yield* captureJobCardSnapshot(page, maxCards, observePageAccess);
        if (latest.cards.length > noCards) {
          return { ...latest, outcome: "cards-observed" };
        }
        if (waitFor === "none") {
          return { ...latest, outcome: "no-cards-observed" };
        }
        yield* sleep(pollIntervalMs);
      }
    },
    function* waitForDeadline(): RiteCoroutine<ReadResult> {
      yield* sleep(readBudgetMs);
      requireOriginalUrl();
      if (!latest) {
        throw new Error("岗位卡片读取超时；本次未能取得页面证据。");
      }
      return { ...latest, outcome: "no-cards-observed" };
    },
  ]);
}
