import { afterEach, expect, test, vi } from "vitest";

import { captureSnapshotMetadata } from "#/browser/page-snapshot.js";

const viewportHeight = 800;
const viewportWidth = 1200;
const viewportScrollY = 100;

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
  vi.stubGlobal("document", {
    body: { innerText: "Rendered workspace evidence" },
    querySelectorAll: () => elements,
    title: "Jobs",
  });
  vi.stubGlobal("getComputedStyle", () => ({ display: "block", visibility: "visible" }));
  vi.stubGlobal("innerHeight", viewportHeight);
  vi.stubGlobal("innerWidth", viewportWidth);
  vi.stubGlobal("location", { href: "https://www.zhipin.com/web/geek/jobs" });
  vi.stubGlobal("scrollY", viewportScrollY);

  const snapshot = captureSnapshotMetadata({
    maximumElements: 1,
    maximumHrefCharacters: 12,
    maximumNameCharacters: 6,
    selector: "interactive-elements",
    startIndex: 0,
    textLimit: 8,
  });

  expect(snapshot).toMatchObject({
    elements: [{ name: "Search", role: "textbox" }],
    text: "Rendered",
    truncated: true,
    url: "https://www.zhipin.com/web/geek/jobs",
    viewport: { height: viewportHeight, scrollY: viewportScrollY, width: viewportWidth },
  });
  expect(JSON.stringify(snapshot)).not.toMatch(/private query|secret-password/u);
});
