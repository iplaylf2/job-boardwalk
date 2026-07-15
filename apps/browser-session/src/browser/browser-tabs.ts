import type { BrowserContext, Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import {
  assertBossNavigationUrl,
  bossEntryUrl,
  isBossNavigationUrl,
} from "./boss-navigation-scope.js";

const blankPageUrls = new Set(["about:blank", "edge://newtab/", "chrome://newtab/"]);
const firstPageId = 1;
const zero = 0;

export function parseOptionalTabId(params: Record<string, unknown>): number | null {
  if (!("tabId" in params)) {
    return null;
  }
  const value = params["tabId"];
  if (!Number.isInteger(value) || typeof value !== "number") {
    throw new TypeError("tabId 必须是整数。");
  }
  return value;
}

export function* readNavigationPageSummary(
  page: Page,
): RiteCoroutine<{ title: string; url: string }> {
  const url = page.url();
  assertBossNavigationUrl(url);
  const title = yield* until(() => page.title());
  return { title, url };
}

export class BrowserTabs {
  readonly #context: BrowserContext;
  readonly #pageIds = new Map<Page, number>();
  readonly #pages = new Map<number, Page>();
  #nextPageId = firstPageId;
  #selectedPageId: number | null = null;

  public constructor(context: BrowserContext) {
    this.#context = context;
    for (const page of context.pages()) {
      this.#register(page);
    }
    context.on("page", (page) => this.#register(page));
  }

  public get tabCount(): number {
    return this.#pages.size;
  }

  public markSelected(tabId: number): void {
    this.#selectedPageId = tabId;
  }

  public requireNavigationPage(tabId: number): Page {
    const page = this.#pages.get(tabId);
    if (!page || page.isClosed()) {
      throw new Error("指定标签页不存在或已经关闭。");
    }
    if (!isBossNavigationUrl(page.url())) {
      throw new Error("指定标签页已经离开当前 BOSS HTTPS 导航范围。");
    }
    return page;
  }

  public resolveNavigationPage(requestedId: number | null): [number, Page] {
    if (requestedId !== null) {
      return [requestedId, this.requireNavigationPage(requestedId)];
    }
    if (this.#selectedPageId !== null) {
      const selected = this.#pages.get(this.#selectedPageId);
      if (selected && !selected.isClosed() && isBossNavigationUrl(selected.url())) {
        return [this.#selectedPageId, selected];
      }
    }
    for (const [id, page] of this.#pages) {
      if (!page.isClosed() && isBossNavigationUrl(page.url())) {
        return [id, page];
      }
    }
    throw new Error("没有可用的 BOSS 标签页；请先调用 browser_tabs ensure 准备页面。");
  }

  public *executeAction(input: Record<string, unknown>): RiteCoroutine<unknown> {
    const { action } = input;
    if (typeof action !== "string" || action.length === zero) {
      throw new TypeError("缺少参数 action。");
    }
    if (action === "list") {
      return yield* this.#list();
    }
    if (action === "ensure") {
      return yield* this.#ensure(input);
    }
    const [tabId, page] = this.resolveNavigationPage(parseOptionalTabId(input));
    if (action === "activate") {
      this.markSelected(tabId);
      yield* until(() => page.bringToFront());
      return { id: tabId, ...(yield* readNavigationPageSummary(page)) };
    }
    throw new Error(`不支持的标签页动作：${action}`);
  }

  *#list(): RiteCoroutine<unknown> {
    const navigationPages = [...this.#pages].filter(([_id, page]) =>
      isBossNavigationUrl(page.url()),
    );
    const tabs = [];
    for (const [id, page] of navigationPages) {
      tabs.push({
        active: id === this.#selectedPageId,
        id,
        title: yield* until(() => page.title()),
        url: page.url(),
      });
    }
    return { tabs };
  }

  *#ensure(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const requestedUrl = params["url"];
    const hasRequestedUrl = typeof requestedUrl === "string";
    const url = hasRequestedUrl ? requestedUrl : bossEntryUrl;
    assertBossNavigationUrl(url);
    const existingNavigationPage = [...this.#pages].find(([_id, page]) =>
      isBossNavigationUrl(page.url()),
    );
    if (existingNavigationPage) {
      const [, existingPage] = existingNavigationPage;
      if (!hasRequestedUrl || existingPage.url() === url) {
        return yield* this.#activate(existingNavigationPage);
      }
      return yield* this.#navigate(existingNavigationPage, url);
    }
    const reusablePage = [...this.#pages].find(([_id, page]) => blankPageUrls.has(page.url()));
    if (reusablePage) {
      return yield* this.#navigate(reusablePage, url);
    }
    return yield* this.#create(url);
  }

  *#activate([tabId, page]: [number, Page]): RiteCoroutine<unknown> {
    this.markSelected(tabId);
    yield* until(() => page.bringToFront());
    return { id: tabId, ...(yield* readNavigationPageSummary(page)) };
  }

  *#create(url: string): RiteCoroutine<unknown> {
    const page = yield* until(() => this.#context.newPage());
    const tabId = this.#register(page);
    this.markSelected(tabId);
    yield* until(() => page.goto(url, { waitUntil: "domcontentloaded" }));
    yield* until(() => page.bringToFront());
    return { id: tabId, ...(yield* readNavigationPageSummary(page)) };
  }

  *#navigate([tabId, page]: [number, Page], url: string): RiteCoroutine<unknown> {
    this.markSelected(tabId);
    yield* until(() => page.goto(url, { waitUntil: "domcontentloaded" }));
    yield* until(() => page.bringToFront());
    return { id: tabId, ...(yield* readNavigationPageSummary(page)) };
  }

  #register(page: Page): number {
    const existing = this.#pageIds.get(page);
    if (existing) {
      return existing;
    }
    const id = this.#nextPageId;
    this.#nextPageId += firstPageId;
    this.#pageIds.set(page, id);
    this.#pages.set(id, page);
    if (isBossNavigationUrl(page.url())) {
      this.markSelected(id);
    }
    page.once("close", () => {
      this.#pageIds.delete(page);
      this.#pages.delete(id);
      if (this.#selectedPageId === id) {
        this.#selectedPageId = null;
      }
    });
    return id;
  }
}
