import type { Browser, Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import { assertResearchUrl, isResearchUrl, researchEntryUrl } from "./research-scope.js";

const blankPageUrls = new Set(["about:blank", "edge://newtab/", "chrome://newtab/"]);
const firstPageId = 1;
const newPageTimeoutMilliseconds = 10_000;
const zero = 0;

export function readOptionalTabId(params: Record<string, unknown>): number | null {
  if (!("tabId" in params)) {
    return null;
  }
  const value = params["tabId"];
  if (!Number.isInteger(value) || typeof value !== "number") {
    throw new TypeError("tabId 必须是整数。");
  }
  return value;
}

export function* readPageIdentity(page: Page): RiteCoroutine<{ title: string; url: string }> {
  const url = page.url();
  assertResearchUrl(url);
  const title = yield* until(() => page.title());
  return { title, url };
}

export class ResearchTabs {
  readonly #browser: Browser;
  readonly #pageIds = new Map<Page, number>();
  readonly #pages = new Map<number, Page>();
  #nextPageId = firstPageId;
  #selectedPageId: number | null = null;

  public constructor(browser: Browser) {
    this.#browser = browser;
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        this.#register(page);
      }
      context.on("page", (page) => this.#register(page));
    }
  }

  public get pageCount(): number {
    return this.#pages.size;
  }

  public select(tabId: number): void {
    this.#selectedPageId = tabId;
  }

  public require(tabId: number): Page {
    const page = this.#pages.get(tabId);
    if (!page || page.isClosed()) {
      throw new Error("指定标签页不存在或已经关闭。");
    }
    if (!isResearchUrl(page.url())) {
      throw new Error("指定标签页已经离开当前 BOSS HTTPS 研究范围。");
    }
    return page;
  }

  public resolve(requestedId: number | null): [number, Page] {
    if (requestedId !== null) {
      return [requestedId, this.require(requestedId)];
    }
    if (this.#selectedPageId !== null) {
      const selected = this.#pages.get(this.#selectedPageId);
      if (selected && !selected.isClosed() && isResearchUrl(selected.url())) {
        return [this.#selectedPageId, selected];
      }
    }
    for (const [id, page] of this.#pages) {
      if (!page.isClosed() && isResearchUrl(page.url())) {
        return [id, page];
      }
    }
    throw new Error("没有可用的 BOSS 标签页；请先调用 browser_tabs 打开页面。");
  }

  public *execute(input: Record<string, unknown>): RiteCoroutine<unknown> {
    const { action } = input;
    if (typeof action !== "string" || action.length === zero) {
      throw new TypeError("缺少参数 action。");
    }
    if (action === "list") {
      return yield* this.#list();
    }
    if (action === "open") {
      return yield* this.#open(input);
    }
    const [tabId, page] = this.resolve(readOptionalTabId(input));
    if (action === "activate") {
      this.select(tabId);
      yield* until(() => page.bringToFront());
      return { id: tabId, ...(yield* readPageIdentity(page)) };
    }
    throw new Error(`不支持的标签页动作：${action}`);
  }

  *#list(): RiteCoroutine<unknown> {
    const researchPages = [...this.#pages].filter(([_id, page]) => isResearchUrl(page.url()));
    const tabs = [];
    for (const [id, page] of researchPages) {
      tabs.push({
        active: id === this.#selectedPageId,
        id,
        title: yield* until(() => page.title()),
        url: page.url(),
      });
    }
    return { tabs };
  }

  *#open(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const requestedUrl = params["url"];
    const hasRequestedUrl = typeof requestedUrl === "string";
    const url = hasRequestedUrl ? requestedUrl : researchEntryUrl;
    assertResearchUrl(url);
    const existingResearchPage = [...this.#pages].find(([_id, page]) => isResearchUrl(page.url()));
    if (existingResearchPage) {
      const [, existingPage] = existingResearchPage;
      if (!hasRequestedUrl || existingPage.url() === url) {
        return yield* this.#activate(existingResearchPage);
      }
      return yield* this.#navigate(existingResearchPage, url);
    }
    const reusablePage = [...this.#pages].find(([_id, page]) => blankPageUrls.has(page.url()));
    if (reusablePage) {
      return yield* this.#navigate(reusablePage, url);
    }
    return yield* this.#create(url);
  }

  *#activate([tabId, page]: [number, Page]): RiteCoroutine<unknown> {
    this.select(tabId);
    yield* until(() => page.bringToFront());
    return { id: tabId, ...(yield* readPageIdentity(page)) };
  }

  *#create(url: string): RiteCoroutine<unknown> {
    const [context] = this.#browser.contexts();
    if (!context) {
      throw new Error("CDP 浏览器没有可用的持久上下文。");
    }
    const existingPages = new Set(context.pages());
    const pageCreated = context.waitForEvent("page", {
      predicate: (page) => !existingPages.has(page),
      timeout: newPageTimeoutMilliseconds,
    });
    const cdpSession = yield* until(() => this.#browser.newBrowserCDPSession());
    try {
      yield* until(() => cdpSession.send("Target.createTarget", { url }));
    } finally {
      yield* until(() => cdpSession.detach());
    }
    const page = yield* until(() => pageCreated);
    const tabId = this.#register(page);
    this.select(tabId);
    yield* until(() => page.waitForLoadState("domcontentloaded"));
    yield* until(() => page.bringToFront());
    return { id: tabId, ...(yield* readPageIdentity(page)) };
  }

  *#navigate([tabId, page]: [number, Page], url: string): RiteCoroutine<unknown> {
    this.select(tabId);
    yield* until(() => page.goto(url, { waitUntil: "domcontentloaded" }));
    yield* until(() => page.bringToFront());
    return { id: tabId, ...(yield* readPageIdentity(page)) };
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
    if (isResearchUrl(page.url())) {
      this.select(id);
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
