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
import { observeCurrentAuthentication, observeLoginHandoff } from "./login-handoff.js";
import type { LoginPreparationOutcome, ObservePageAccess } from "./login-handoff.js";
import { navigatePage, readNavigationPageSummary } from "./page-navigation.js";
import type { NavigationResult } from "./page-navigation.js";
import { inspectPageDocument } from "./page-inspection.js";

const blankPageUrls = new Set(["about:blank", "edge://newtab/", "chrome://newtab/"]);
const firstPageId = 1;

export function parseOptionalTabId(params: Record<string, unknown>): number | null {
  return (params["tabId"] as number | undefined) ?? null;
}

export interface LoginPreparationResult {
  readonly id: number;
  readonly outcome: LoginPreparationOutcome;
  readonly platformId: PlatformId;
  readonly title: string;
  readonly url: string;
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

  public *prepareLogin(
    input: Record<string, unknown>,
    observePageAccess: ObservePageAccess,
  ): RiteCoroutine<LoginPreparationResult> {
    const platformId = readPlatformId(input);
    const adapter = recruitingPlatformAdapters[platformId];
    const existingPlatformPages = [...this.#pages].filter(([_id, page]) =>
      adapter.isInNavigationScope(page.url()),
    );
    let reusableObservedPage: [number, Page] | null = null;
    for (const [id, page] of existingPlatformPages) {
      const observation = yield* observeCurrentAuthentication(page, adapter, observePageAccess);
      if (observation.outcome === "unreadable") {
        continue;
      }
      reusableObservedPage ??= [id, page];
      if (observation.authentication) {
        yield* this.selectPage(page);
        return {
          id,
          platformId,
          ...observation.authentication,
        };
      }
    }
    const navigation = yield* this.#openLoginPage(adapter.loginUrl, reusableObservedPage);
    const page = this.#pages.get(navigation.id);
    if (!page || page.isClosed()) {
      throw new Error(`${adapter.label}登录交接尚未就绪：标签页已经关闭。`);
    }
    const observed = yield* observeLoginHandoff(page, adapter, observePageAccess);
    return {
      id: navigation.id,
      outcome: observed.outcome,
      platformId,
      title: observed.title,
      url: observed.url,
    };
  }

  *#openLoginPage(
    loginUrl: string,
    reusableObservedPage: [number, Page] | null,
  ): RiteCoroutine<NavigationResult & { id: number }> {
    if (reusableObservedPage) {
      const [, page] = reusableObservedPage;
      if (!page.isClosed()) {
        return page.url() === loginUrl
          ? yield* this.#activate(reusableObservedPage, loginUrl)
          : yield* this.#navigate(reusableObservedPage, loginUrl);
      }
    }
    const blankPage = [...this.#pages].find(
      ([_id, page]) => !page.isClosed() && blankPageUrls.has(page.url()),
    );
    return blankPage ? yield* this.#navigate(blankPage, loginUrl) : yield* this.#create(loginUrl);
  }

  *#list(): RiteCoroutine<unknown> {
    const navigationPages = [...this.#pages].filter(([_id, page]) =>
      findRecruitingPlatformAdapter(page.url()),
    );
    const tabs = [];
    for (const [id, page] of navigationPages) {
      const pageInspection = yield* inspectPageDocument(page);
      tabs.push({
        active: id === this.#selectedPageId,
        id,
        pageInspection,
        platformId: requireRecruitingPlatformAdapter(page.url()).platformId,
        ...(pageInspection.outcome === "observed" ? { title: pageInspection.title } : {}),
        url: page.url(),
      });
    }
    return { tabs };
  }

  *#ensure(params: Record<string, unknown>): RiteCoroutine<NavigationResult & { id: number }> {
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
        return yield* this.#activate(existingNavigationPage, url);
      }
      return yield* this.#navigate(existingNavigationPage, url);
    }
    const reusablePage = [...this.#pages].find(([_id, page]) => blankPageUrls.has(page.url()));
    if (reusablePage) {
      return yield* this.#navigate(reusablePage, url);
    }
    return yield* this.#create(url);
  }

  *#activate(
    [tabId, page]: [number, Page],
    requestedUrl: string,
  ): RiteCoroutine<NavigationResult & { id: number }> {
    yield* this.selectPage(page);
    return {
      id: tabId,
      ...(yield* readNavigationPageSummary(page)),
      navigation: { outcome: "already-current" },
      requestedUrl,
    };
  }

  *#create(url: string): RiteCoroutine<NavigationResult & { id: number }> {
    const page = yield* until(() => this.#context.newPage());
    const tabId = this.#register(page);
    this.markSelected(tabId);
    const navigation = yield* navigatePage(page, url);
    yield* until(() => page.bringToFront());
    return { id: tabId, ...navigation };
  }

  *#navigate(
    [tabId, page]: [number, Page],
    url: string,
  ): RiteCoroutine<NavigationResult & { id: number }> {
    this.markSelected(tabId);
    const navigation = yield* navigatePage(page, url);
    yield* until(() => page.bringToFront());
    return { id: tabId, ...navigation };
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
