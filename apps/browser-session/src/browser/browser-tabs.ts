import type { BrowserContext, Page } from "patchright";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

import {
  assertPlatformNavigationUrl,
  findRecruitingPlatformAdapter,
  readPlatformId,
  recruitingPlatformAdapters,
  requireRecruitingPlatformAdapter,
} from "./recruiting-platform-adapters.js";

const blankPageUrls = new Set(["about:blank", "edge://newtab/", "chrome://newtab/"]);
const firstPageId = 1;

export function parseOptionalTabId(params: Record<string, unknown>): number | null {
  return (params["tabId"] as number | undefined) ?? null;
}

export function* readNavigationPageSummary(
  page: Page,
): RiteCoroutine<{ platformId: PlatformId; title: string; url: string }> {
  const url = page.url();
  const { platformId } = requireRecruitingPlatformAdapter(url);
  const title = yield* until(() => page.title());
  return { platformId, title, url };
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

  public *selectPage(page: Page): RiteCoroutine<void> {
    this.markSelected(this.#register(page));
    yield* until(() => page.bringToFront());
  }

  public requireNavigationPage(tabId: number): Page {
    const page = this.#pages.get(tabId);
    if (!page || page.isClosed()) {
      throw new Error("指定标签页不存在或已经关闭。");
    }
    if (!findRecruitingPlatformAdapter(page.url())) {
      throw new Error("指定标签页已离开受支持招聘平台的 HTTPS 导航范围。");
    }
    return page;
  }

  public resolveNavigationPage(requestedId: number | null): [number, Page] {
    if (requestedId !== null) {
      return [requestedId, this.requireNavigationPage(requestedId)];
    }
    if (this.#selectedPageId !== null) {
      const selected = this.#pages.get(this.#selectedPageId);
      if (selected && !selected.isClosed() && findRecruitingPlatformAdapter(selected.url())) {
        return [this.#selectedPageId, selected];
      }
    }
    for (const [id, page] of this.#pages) {
      if (!page.isClosed() && findRecruitingPlatformAdapter(page.url())) {
        return [id, page];
      }
    }
    throw new Error("没有可用的招聘平台标签页；请先调用 browser_tabs ensure 准备页面。");
  }

  public resolvePlatformPage(platformId: PlatformId, requestedId: number | null): [number, Page] {
    if (requestedId !== null) {
      const page = this.requireNavigationPage(requestedId);
      assertPlatformNavigationUrl(platformId, page.url());
      return [requestedId, page];
    }
    if (this.#selectedPageId !== null) {
      const selected = this.#pages.get(this.#selectedPageId);
      if (
        selected &&
        !selected.isClosed() &&
        recruitingPlatformAdapters[platformId].isInNavigationScope(selected.url())
      ) {
        return [this.#selectedPageId, selected];
      }
    }
    for (const [id, page] of this.#pages) {
      if (
        !page.isClosed() &&
        recruitingPlatformAdapters[platformId].isInNavigationScope(page.url())
      ) {
        return [id, page];
      }
    }
    throw new Error(
      `没有可用的${recruitingPlatformAdapters[platformId].label}标签页；请先调用 browser_tabs ensure 准备页面。`,
    );
  }

  public *executeAction(input: Record<string, unknown>): RiteCoroutine<unknown> {
    const { action } = input;
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

  public *prepareLogin(input: Record<string, unknown>): RiteCoroutine<unknown> {
    const platformId = readPlatformId(input);
    const adapter = recruitingPlatformAdapters[platformId];
    return yield* this.#ensure({ platformId, url: adapter.loginUrl });
  }

  *#list(): RiteCoroutine<unknown> {
    const navigationPages = [...this.#pages].filter(([_id, page]) =>
      findRecruitingPlatformAdapter(page.url()),
    );
    const tabs = [];
    for (const [id, page] of navigationPages) {
      tabs.push({
        active: id === this.#selectedPageId,
        id,
        platformId: requireRecruitingPlatformAdapter(page.url()).platformId,
        title: yield* until(() => page.title()),
        url: page.url(),
      });
    }
    return { tabs };
  }

  *#ensure(params: Record<string, unknown>): RiteCoroutine<unknown> {
    const platformId = readPlatformId(params);
    const adapter = recruitingPlatformAdapters[platformId];
    const requestedUrl = params["url"];
    const hasRequestedUrl = typeof requestedUrl === "string";
    const url = hasRequestedUrl ? requestedUrl : adapter.entryUrl;
    assertPlatformNavigationUrl(platformId, url);
    const existingNavigationPage = [...this.#pages].find(([_id, page]) =>
      adapter.isInNavigationScope(page.url()),
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
    yield* this.selectPage(page);
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
    if (findRecruitingPlatformAdapter(page.url())) {
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
