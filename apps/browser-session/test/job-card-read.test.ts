import type { Page } from "patchright";
import { run } from "@shajara/host";
import { afterEach, expect, test, vi } from "vitest";
import { readJobCards } from "#/browser/job-observation/card-read.js";

const url = "https://we.51job.com/pc/search";
const card = { details: [], text: "合成雇主甲 合成平台岗位", title: "合成平台岗位" };
const emptyCount = 0;
const firstRead = 1;
const secondRead = 2;

function cardPage(readCards: () => (typeof card)[]) {
  let currentUrl = url;
  const state = { reads: emptyCount };
  const page = {
    evaluate: () => {
      state.reads += firstRead;
      return Promise.resolve({
        accessElements: [],
        accessText: "",
        cards: readCards(),
        title: "合成搜索结果",
        truncated: false,
        url: currentUrl,
      });
    },
    url: () => currentUrl,
  } as unknown as Page;
  return {
    navigate: () => {
      currentUrl = "https://we.51job.com/pc/search?keyword=changed";
    },
    page,
    state,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

test("returns current evidence without waiting when no condition was requested", async () => {
  const { page, state } = cardPage(() => []);
  const result = await run(() => readJobCards(page, "none", () => null));
  expect(result).toMatchObject({ cards: [], outcome: "no-cards-observed" });
  expect(state.reads).toBe(firstRead);
});

test("waits for recognized cards and stops as soon as they appear", async () => {
  vi.useFakeTimers();
  let readCount = emptyCount;
  const { page, state } = cardPage(() => {
    readCount += firstRead;
    return readCount === firstRead ? [] : [card];
  });
  const reading = run(() => readJobCards(page, "cards-present", () => null));
  await vi.runAllTimersAsync();
  expect(await reading).toMatchObject({ cards: [card], outcome: "cards-observed" });
  expect(state.reads).toBe(secondRead);
});

test("returns an unconfirmed observation when the budget ends without cards", async () => {
  vi.useFakeTimers();
  const { page } = cardPage(() => []);
  const reading = run(() => readJobCards(page, "cards-present", () => null));
  await vi.runAllTimersAsync();
  expect(await reading).toMatchObject({ cards: [], outcome: "no-cards-observed", sourceUrl: url });
});

test("stops on a page read failure instead of retrying it as loading", async () => {
  const { page, state } = cardPage(() => {
    throw new Error("synthetic read failure");
  });
  await expect(run(() => readJobCards(page, "cards-present", () => null))).rejects.toThrow();
  expect(state.reads).toBe(firstRead);
});

test("does not continue waiting on a different search document", async () => {
  vi.useFakeTimers();
  const { page, state, navigate } = cardPage(() => []);
  const failed = run(() => readJobCards(page, "cards-present", navigate)).then(
    () => null,
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  expect(await failed).toBeInstanceOf(Error);
  expect(state.reads).toBe(firstRead);
});

test("bounds an unreadable page instead of reporting empty results", async () => {
  vi.useFakeTimers();
  const { page } = cardPage(() => []);
  Object.assign(page, {
    evaluate: () =>
      new Promise(() => {
        /* Simulate a driver read that never settles. */
      }),
  });
  const reading = run(() => readJobCards(page, "cards-present", () => null));
  const rejected = expect(reading).rejects.toThrow();
  await vi.runAllTimersAsync();
  await rejected;
});
