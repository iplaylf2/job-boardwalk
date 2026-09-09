import type { Page } from "patchright";
import { errors } from "patchright";
import { run } from "@shajara/host";
import { afterEach, expect, test, vi } from "vitest";

import { capturePageSnapshot, captureSnapshotMetadata } from "#/browser/page-snapshot.js";

const firstIndex = 0;
const secondIndex = 1;
const viewportHeight = 800;
const viewportWidth = 1200;
const viewportScrollY = 100;
const snapshotTextLimit = 100;

interface FakeElementOptions {
  attributes?: Record<string, string>;
  matchingSelectors?: string[];
  tagName: string;
  textContent?: string;
  innerText?: string;
}

function fakeElement({
  attributes = {},
  matchingSelectors = [],
  tagName,
  textContent = "",
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  innerText = textContent,
}: FakeElementOptions): HTMLElement {
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    getBoundingClientRect: () => ({ height: 20, width: 100 }),
    ...(attributes["href"] ? { href: attributes["href"] } : {}),
    innerText,
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
    referenceScope: "synthetic-snapshot",
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
    url: () => "https://www.zhipin.com/",
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
    url: () => "https://www.zhipin.com/",
  } as unknown as Page;

  const observedFailure = await run(() => capturePageSnapshot(page, snapshotTextLimit)).catch(
    (error: unknown) => error,
  );

  expect(observedFailure).toBeDefined();
  expect(evaluations).toEqual(["body", "html"]);
});

function syntheticSnapshot(elements: HTMLElement[]) {
  const document = {
    defaultView: {
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      innerHeight: viewportHeight,
      innerWidth: viewportWidth,
      scrollY: 0,
    },
    location: { href: "https://we.51job.com/pc/search" },
    querySelectorAll: () => elements,
    readyState: "complete",
    title: "合成岗位列表",
  } as unknown as Document;
  const body = { innerText: "合成岗位列表", ownerDocument: document } as HTMLElement;
  return (referenceScope: string) =>
    captureSnapshotMetadata(body, {
      interactions: [
        { contextSelector: ".joblist-item", role: "link", selector: ".joblist-item .jname" },
      ],
      maximumElements: 300,
      maximumHrefCharacters: 2048,
      maximumNameCharacters: 300,
      referenceScope,
      selector: "synthetic-elements",
      startIndex: 0,
      textLimit: snapshotTextLimit,
    });
}

test("uses visible nested text and explicit names without including hidden dialog content", () => {
  const capture = syntheticSnapshot([
    fakeElement({
      innerText: "合成岗位 可见标签",
      tagName: "A",
      textContent: "合成岗位 可见标签 隐藏申请弹窗",
    }),
    fakeElement({
      attributes: { "aria-label": "合成图标按钮" },
      innerText: "",
      tagName: "BUTTON",
      textContent: "隐藏文字",
    }),
    fakeElement({ attributes: { title: "合成提示" }, innerText: "可见文字", tagName: "BUTTON" }),
  ]);
  const snapshot = capture("first");
  expect(snapshot.elements.map(({ name }) => name)).toEqual([
    "合成岗位 可见标签",
    "合成图标按钮",
    "合成提示",
  ]);
  expect(JSON.stringify(snapshot)).not.toContain("隐藏");
});

test("distinguishes identical title nodes and invalidates replaced nodes and changed card context", () => {
  const context = { innerText: "合成岗位 合成雇主 10-15K" };
  function title() {
    return Object.assign(
      fakeElement({
        innerText: "合成岗位",
        matchingSelectors: [".joblist-item .jname"],
        tagName: "SPAN",
      }),
      { closest: () => context },
    );
  }
  const elements = [title(), title()];
  const capture = syntheticSnapshot(elements);
  const initial = capture("first");
  expect(
    initial.elements.map(({ context: cardContext, name, role }) => ({ cardContext, name, role })),
  ).toEqual([
    { cardContext: context["innerText"], name: "合成岗位", role: "link" },
    { cardContext: context["innerText"], name: "合成岗位", role: "link" },
  ]);
  const [first, second] = initial.elements;
  expect(first?.signature).not.toBe(second?.signature);
  expect(capture("second").elements).toEqual(initial.elements);
  elements[firstIndex] = title();
  expect(capture("third").elements[firstIndex]?.signature).not.toBe(first?.signature);
  context["innerText"] = "合成岗位 合成雇主 20-25K";
  expect(capture("fourth").elements[secondIndex]?.signature).not.toBe(second?.signature);
});
