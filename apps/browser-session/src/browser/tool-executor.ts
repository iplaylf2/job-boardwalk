import type { BrowserContext, Locator } from "patchright";
import type { PlatformAccessObservation } from "@job-boardwalk/contracts";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { BackgroundCollectionControl } from "./background-collection-control.js";
import { BrowserTabs, parseOptionalTabId, readNavigationPageSummary } from "./browser-tabs.js";
import { clickAndCapturePopup } from "./click-popup.js";
import {
  assertPlatformNavigationLink,
  findRecruitingPlatformAdapter,
  requireRecruitingPlatformAdapter,
} from "./recruiting-platform-adapters.js";
import type { PageAccessFacts } from "./recruiting-platform-adapters.js";
import {
  capturePageSnapshot,
  maximumElementHrefCharacters,
  maximumElementNameCharacters,
} from "./page-snapshot.js";
import { captureJobCardSnapshot } from "./job-card-snapshot.js";

const zero = 0;

interface ElementReference {
  href?: string;
  locator: Locator;
  signature: string;
  tabId: number;
}

function* waitForRequestedInterval(params: Record<string, unknown>): RiteCoroutine<unknown> {
  const milliseconds = params["milliseconds"] as number;
  yield* sleep(milliseconds);
  return { waitedMilliseconds: milliseconds };
}

export class BrowserToolExecutor {
  readonly #elementReferences = new Map<string, ElementReference>();
  readonly #collectionControl: BackgroundCollectionControl;
  readonly #observePageAccess: (page: PageAccessFacts) => PlatformAccessObservation | null;
  readonly #recordReturnedControl: (platformId: PlatformId) => void;
  readonly #tabs: BrowserTabs;

  public constructor(
    context: BrowserContext,
    observePageAccess: (page: PageAccessFacts) => PlatformAccessObservation | null,
    collectionControl: BackgroundCollectionControl,
    recordReturnedControl: (platformId: PlatformId) => void,
  ) {
    this.#collectionControl = collectionControl;
    this.#observePageAccess = observePageAccess;
    this.#recordReturnedControl = recordReturnedControl;
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
      case "browser_job_card_snapshot": {
        return yield* this.#jobCardSnapshot(input);
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
    const sourcePage = this.#tabs.requireNavigationPage(reference.tabId);
    try {
      if (reference.href) {
        const adapter = findRecruitingPlatformAdapter(sourcePage.url());
        if (!adapter) {
          throw new Error("当前页面不属于受支持招聘平台的 HTTPS 导航范围。");
        }
        assertPlatformNavigationLink(adapter.platformId, reference.href);
      }
      yield* until(() => reference.locator.scrollIntoViewIfNeeded());
      const popupPage = yield* clickAndCapturePopup(sourcePage, reference.locator);
      return yield* readNavigationPageSummary(popupPage ?? sourcePage);
    } finally {
      this.#clearElementReferences();
    }
  }

  *#prepareLogin(params: Record<string, unknown>): RiteCoroutine<unknown> {
    yield* this.#collectionControl.pauseForUserHandoff();
    try {
      const result = yield* this.#tabs.prepareLogin(params);
      this.#collectionControl.completeUserHandoff();
      return result;
    } catch (error) {
      this.#collectionControl.cancelUserHandoff();
      throw error;
    } finally {
      this.#clearElementReferences();
    }
  }

  *#fill(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const reference = yield* this.#verifiedReference(params);
    try {
      yield* until(() => reference.locator.fill(params["value"] as string));
      return yield* readNavigationPageSummary(this.#tabs.requireNavigationPage(reference.tabId));
    } finally {
      this.#clearElementReferences();
    }
  }

  *#navigate(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const url = params["url"] as string;
    const { platformId } = requireRecruitingPlatformAdapter(url);
    const [tabId, page] = this.#tabs.resolvePlatformPage(platformId, parseOptionalTabId(params));
    this.#tabs.markSelected(tabId);
    yield* until(() => page.bringToFront());
    yield* until(() => page.goto(url, { waitUntil: "domcontentloaded" }));
    this.#clearElementReferences();
    return yield* readNavigationPageSummary(page);
  }

  #reference(params: Record<string, unknown>): ElementReference {
    const ref = params["ref"] as string;
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
    const deltaY = params["deltaY"] as number;
    this.#tabs.markSelected(tabId);
    yield* until(() => page.mouse.wheel(zero, deltaY));
    this.#clearElementReferences();
    const summary = yield* readNavigationPageSummary(page);
    const scrollY = yield* until(() => page.evaluate(() => globalThis.scrollY));
    return { ...summary, scrollY };
  }

  *#jobCardSnapshot(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const maximumCards = params["maximumCards"] as number;
    const [tabId, page] = this.#tabs.resolveNavigationPage(parseOptionalTabId(params));
    this.#tabs.markSelected(tabId);
    const snapshot = yield* captureJobCardSnapshot(page, maximumCards, this.#observePageAccess);
    return { ...snapshot, tabId };
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
      yield* until(() => reference.locator.selectOption(params["value"] as string));
      return yield* readNavigationPageSummary(this.#tabs.requireNavigationPage(reference.tabId));
    } finally {
      this.#clearElementReferences();
    }
  }

  *#snapshot(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const [tabId, page] = this.#tabs.resolveNavigationPage(parseOptionalTabId(params));
    this.#tabs.markSelected(tabId);
    const textLimit = params["maxTextCharacters"] as number;
    this.#clearElementReferences();
    const settleMilliseconds =
      findRecruitingPlatformAdapter(page.url())?.snapshotSettleMilliseconds ?? zero;
    if (settleMilliseconds > zero) {
      yield* sleep(settleMilliseconds);
    }
    const snapshot = yield* capturePageSnapshot(page, textLimit);
    const adapter = findRecruitingPlatformAdapter(snapshot.url);
    if (
      adapter &&
      params["userReturnedControl"] === true &&
      this.#collectionControl.returnControl()
    ) {
      this.#recordReturnedControl(adapter.platformId);
    }
    const platformAccessObservation = this.#observePageAccess(snapshot);
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
      platformAccessObservation,
      tabId,
    };
  }

  #clearElementReferences(): void {
    this.#elementReferences.clear();
  }
}
