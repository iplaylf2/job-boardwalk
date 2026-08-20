import type { Page } from "patchright";
import { errors } from "patchright";
import { run } from "@shajara/host";
import { afterEach, expect, test, vi } from "vitest";

import { capturePageSnapshot, captureSnapshotMetadata } from "#/browser/page-snapshot.js";

const viewportHeight = 800;
const viewportWidth = 1200;
const viewportScrollY = 100;
const snapshotTextLimit = 100;

interface FakeElementOptions {
  attributes?: Record<string, string>;
  matchingSelectors?: string[];
  tagName: string;
  textContent?: string;
}

function fakeElement({
  attributes = {},
  matchingSelectors = [],
  tagName,
  textContent = "",
}: FakeElementOptions): HTMLElement {
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    getBoundingClientRect: () => ({ height: 20, width: 100 }),
    ...(attributes["href"] ? { href: attributes["href"] } : {}),
    matches: (selector: string) => matchingSelectors.includes(selector),
    tagName,
    textContent,
  } as unknown as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("bounds snapshot evidence without exposing password controls or form values", () => {
  const elements = [
    fakeElement({
      attributes: { "aria-label": "Password", type: "password", value: "secret-password" },
      matchingSelectors: ["input[type='password' i]", "input, textarea, [contenteditable='true']"],
      tagName: "INPUT",
    }),
    fakeElement({
      attributes: { href: "https://outside.example/oversized" },
      matchingSelectors: ["a[href]"],
      tagName: "A",
      textContent: "Oversized link",
    }),
    fakeElement({
      attributes: { placeholder: "Search jobs", type: "text", value: "private query" },
      matchingSelectors: ["input, textarea, [contenteditable='true']"],
      tagName: "INPUT",
    }),
    fakeElement({ matchingSelectors: ["button"], tagName: "BUTTON", textContent: "More" }),
  ];
  const view = {
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    innerHeight: viewportHeight,
    innerWidth: viewportWidth,
    scrollY: viewportScrollY,
  };
  const document = {
    defaultView: view,
    location: { href: "https://www.zhipin.com/web/geek/jobs" },
    querySelectorAll: () => elements,
    readyState: "complete",
    title: "Jobs",
  } as unknown as Document;
  const body = {
    innerText: "Rendered workspace evidence",
    ownerDocument: document,
  } as unknown as HTMLElement;

  const snapshot = captureSnapshotMetadata(body, {
    maximumElements: 1,
    maximumHrefCharacters: 12,
    maximumNameCharacters: 6,
    selector: "interactive-elements",
    startIndex: 0,
    textLimit: 8,
  });

  expect(snapshot).toMatchObject({
    documentReadyState: "complete",
    elements: [{ name: "Search", role: "textbox" }],
    text: "Rendered",
    truncated: true,
    url: "https://www.zhipin.com/web/geek/jobs",
    viewport: { height: viewportHeight, scrollY: viewportScrollY, width: viewportWidth },
  });
  expect(JSON.stringify(snapshot)).not.toMatch(/private query|secret-password/u);
});

test("does not retry a snapshot failure that is not a driver timeout", async () => {
  const evaluations: string[] = [];
  const failure = new Error("synthetic page evaluation failure");
  const page = {
    isClosed: () => false,
    locator: (selector: string) => ({
      evaluate: () => {
        evaluations.push(selector);
        return Promise.reject(failure);
      },
    }),
  } as unknown as Page;

  const observedFailure = await run(() => capturePageSnapshot(page, snapshotTextLimit)).catch(
    (error: unknown) => error,
  );

  expect(observedFailure).toBeDefined();
  expect(evaluations).toEqual(["body"]);
});

test("inspects the page after a snapshot timeout without retrying the snapshot", async () => {
  const timeout = new errors.TimeoutError("synthetic snapshot timeout");
  const evaluations: string[] = [];
  const page = {
    isClosed: () => false,
    locator: (selector: string) => ({
      evaluate: () => {
        evaluations.push(selector);
        if (selector === "html") {
          return Promise.resolve({
            documentReadyState: "loading",
            outcome: "observed",
            title: "Loading",
          });
        }
        return Promise.reject(timeout);
      },
    }),
  } as unknown as Page;

  const observedFailure = await run(() => capturePageSnapshot(page, snapshotTextLimit)).catch(
    (error: unknown) => error,
  );

  expect(observedFailure).toBeDefined();
  expect(evaluations).toEqual(["body", "html"]);
});
