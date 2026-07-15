import type { BrowserContext, Locator } from "patchright";
import { sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import { BrowserTabs, parseOptionalTabId, readNavigationPageSummary } from "./browser-tabs.js";
import {
  assertPlatformNavigationLink,
  requireRecruitingPlatformAdapter,
} from "./recruiting-platform-adapters.js";
import {
  capturePageSnapshot,
  maximumElementHrefCharacters,
  maximumElementNameCharacters,
} from "./page-snapshot.js";

const defaultScrollDelta = 600;
const maximumSnapshotTextCharacters = 40_000;
const minimumSnapshotTextCharacters = 1000;
const maximumWaitMilliseconds = 10_000;
const maximumScrollDelta = 5000;
const minimumScrollDelta = -maximumScrollDelta;
const zero = 0;

interface ElementReference {
  href?: string;
  locator: Locator;
  signature: string;
  tabId: number;
}

function boundedNumber(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} 必须是 ${String(minimum)} 到 ${String(maximum)} 之间的数字。`);
  }
  return value;
}

function requiredString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || value.length === zero) {
    throw new TypeError(`缺少参数 ${name}。`);
  }
  return value;
}

function* waitForRequestedInterval(params: Record<string, unknown>): RiteCoroutine<unknown> {
  const milliseconds = boundedNumber(
    params["milliseconds"],
    "milliseconds",
    zero,
    maximumWaitMilliseconds,
  );
  yield* sleep(milliseconds);
  return { waitedMilliseconds: milliseconds };
}

export class BrowserToolExecutor {
  readonly #elementReferences = new Map<string, ElementReference>();
  readonly #tabs: BrowserTabs;

  public constructor(context: BrowserContext) {
    this.#tabs = new BrowserTabs(context);
  }

  public get tabCount(): number {
    return this.#tabs.tabCount;
  }

  public *execute(toolName: string, input: Record<string, unknown>): RiteCoroutine<unknown> {
    switch (toolName) {
      case "browser_wait": {
        return yield* waitForRequestedInterval(input);
      }
      case "browser_tabs": {
        return yield* this.#tabs.executeAction(input);
      }
      case "browser_prepare_login": {
        return yield* this.#prepareLogin(input);
      }
      case "browser_navigate": {
        return yield* this.#navigate(input);
      }
      case "browser_snapshot": {
        return yield* this.#snapshot(input);
      }
      case "browser_click": {
        return yield* this.#click(input);
      }
      case "browser_fill": {
        return yield* this.#fill(input);
      }
      case "browser_select": {
        return yield* this.#select(input);
      }
      case "browser_scroll": {
        return yield* this.#scroll(input);
      }
      default: {
        throw new Error(`不支持的浏览器工具：${toolName}`);
      }
    }
  }

  *#click(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const reference = yield* this.#verifiedReference(params);
    try {
      if (reference.href) {
        const page = this.#tabs.requireNavigationPage(reference.tabId);
        const { platformId } = requireRecruitingPlatformAdapter(page.url());
        assertPlatformNavigationLink(platformId, reference.href);
      }
      yield* until(() => reference.locator.scrollIntoViewIfNeeded());
      yield* until(() => reference.locator.click());
      return yield* readNavigationPageSummary(this.#tabs.requireNavigationPage(reference.tabId));
    } finally {
      this.#clearElementReferences();
    }
  }

  *#prepareLogin(params: Record<string, unknown>): RiteCoroutine<unknown> {
    try {
      return yield* this.#tabs.prepareLogin(params);
    } finally {
      this.#clearElementReferences();
    }
  }

  *#fill(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const reference = yield* this.#verifiedReference(params);
    try {
      yield* until(() => reference.locator.fill(requiredString(params, "value")));
      return yield* readNavigationPageSummary(this.#tabs.requireNavigationPage(reference.tabId));
    } finally {
      this.#clearElementReferences();
    }
  }

  *#navigate(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const url = requiredString(params, "url");
    const { platformId } = requireRecruitingPlatformAdapter(url);
    const [tabId, page] = this.#tabs.resolvePlatformPage(platformId, parseOptionalTabId(params));
    this.#tabs.markSelected(tabId);
    yield* until(() => page.bringToFront());
    yield* until(() => page.goto(url, { waitUntil: "domcontentloaded" }));
    this.#clearElementReferences();
    return yield* readNavigationPageSummary(page);
  }

  #reference(params: Record<string, unknown>): ElementReference {
    const ref = requiredString(params, "ref");
    const reference = this.#elementReferences.get(ref);
    if (!reference) {
      throw new Error("元素引用不存在或已过期；请重新调用 browser_snapshot。");
    }
    return reference;
  }

  *#verifiedReference(params: Record<string, unknown>): RiteCoroutine<ElementReference> {
    const reference = this.#reference(params);
    this.#tabs.requireNavigationPage(reference.tabId);
    const signature = yield* until(() =>
      reference.locator.evaluate(
        (element, limits) => {
          const startIndex = 0;
          const href = element.matches("a[href]") ? (element as HTMLAnchorElement).href : "";
          if (href.length > limits.maximumHrefCharacters) {
            return "oversized-link";
          }
          return [
            element.tagName,
            element.getAttribute("type") ?? "",
            href,
            element.getAttribute("role") ?? "",
            element.getAttribute("aria-label") ?? "",
            element.getAttribute("title") ?? "",
            element.getAttribute("placeholder") ?? "",
            element.getAttribute("alt") ?? "",
            (element.textContent ?? "")
              .replaceAll(/\s+/gu, " ")
              .trim()
              .slice(startIndex, limits.maximumNameCharacters),
          ].join("\u001F");
        },
        {
          maximumHrefCharacters: maximumElementHrefCharacters,
          maximumNameCharacters: maximumElementNameCharacters,
        },
      ),
    );
    if (signature !== reference.signature) {
      throw new Error("元素引用对应的页面内容已经变化；请重新调用 browser_snapshot 后再操作。");
    }
    return reference;
  }

  *#scroll(params: Record<string, unknown>): RiteCoroutine<unknown> {
    if (typeof params["ref"] === "string") {
      return yield* this.#scrollToReference(params);
    }
    const [tabId, page] = this.#tabs.resolveNavigationPage(parseOptionalTabId(params));
    const hasRequestedDelta = "deltaY" in params;
    const requestedDelta = params["deltaY"];
    const deltaY = hasRequestedDelta
      ? boundedNumber(requestedDelta, "deltaY", minimumScrollDelta, maximumScrollDelta)
      : defaultScrollDelta;
    this.#tabs.markSelected(tabId);
    yield* until(() => page.mouse.wheel(zero, deltaY));
    this.#clearElementReferences();
    const summary = yield* readNavigationPageSummary(page);
    const scrollY = yield* until(() => page.evaluate(() => globalThis.scrollY));
    return { ...summary, scrollY };
  }

  *#scrollToReference(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const reference = yield* this.#verifiedReference(params);
    try {
      yield* until(() => reference.locator.scrollIntoViewIfNeeded());
      return yield* readNavigationPageSummary(this.#tabs.requireNavigationPage(reference.tabId));
    } finally {
      this.#clearElementReferences();
    }
  }

  *#select(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const reference = yield* this.#verifiedReference(params);
    try {
      yield* until(() => reference.locator.selectOption(requiredString(params, "value")));
      return yield* readNavigationPageSummary(this.#tabs.requireNavigationPage(reference.tabId));
    } finally {
      this.#clearElementReferences();
    }
  }

  *#snapshot(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const [tabId, page] = this.#tabs.resolveNavigationPage(parseOptionalTabId(params));
    this.#tabs.markSelected(tabId);
    const hasRequestedLimit = "maxTextCharacters" in params;
    const requestedLimit = params["maxTextCharacters"];
    const textLimit = hasRequestedLimit
      ? boundedNumber(
          requestedLimit,
          "maxTextCharacters",
          minimumSnapshotTextCharacters,
          maximumSnapshotTextCharacters,
        )
      : maximumSnapshotTextCharacters;
    this.#clearElementReferences();
    const snapshot = yield* capturePageSnapshot(page, textLimit);
    for (const { href, locator, ref, signature } of snapshot.elements) {
      this.#elementReferences.set(ref, {
        ...(href ? { href } : {}),
        locator,
        signature,
        tabId,
      });
    }
    return {
      ...snapshot,
      elements: snapshot.elements.map(
        ({ locator: _locator, signature: _signature, ...element }) => element,
      ),
      tabId,
    };
  }

  #clearElementReferences(): void {
    this.#elementReferences.clear();
  }
}
