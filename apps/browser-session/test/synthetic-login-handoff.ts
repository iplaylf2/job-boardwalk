import type { BrowserContext, Locator, Page } from "patchright";

import { createSyntheticPageLocator } from "./synthetic-page-locator.js";

export interface SyntheticLoginPage {
  navigationCount: number;
  page: Page;
  url: string;
}

interface SyntheticLoginPageOptions {
  readonly afterNavigation?: (state: SyntheticLoginPage) => void;
  readonly navigationError?: Error;
  readonly snapshotError?: Error;
  readonly snapshotElements?: readonly {
    readonly href?: string;
    readonly name: string;
    readonly role: string;
  }[];
  readonly snapshotText?: string | ((state: SyntheticLoginPage) => string);
}

const navigationIncrement = 1;
const noScroll = 0;
const syntheticViewportHeight = 800;
const syntheticViewportWidth = 1200;

export function syntheticLoginPage(
  initialUrl: string,
  options: SyntheticLoginPageOptions = {},
): SyntheticLoginPage {
  const state: SyntheticLoginPage = {
    navigationCount: 0,
    page: null as unknown as Page,
    url: initialUrl,
  };
  const snapshotElements = options.snapshotElements ?? [
    { name: "Synthetic login control", role: "button" },
  ];
  function snapshot() {
    if (options.snapshotError) {
      return Promise.reject(options.snapshotError);
    }
    return Promise.resolve({
      documentReadyState: "complete",
      elements: snapshotElements.map((element, sourceIndex) => ({
        disabled: false,
        href: element.href,
        name: element.name,
        role: element.role,
        signature: `synthetic-${String(sourceIndex)}`,
        sourceIndex,
      })),
      text:
        typeof options.snapshotText === "function"
          ? options.snapshotText(state)
          : (options.snapshotText ?? "Synthetic visible login interface"),
      title: "Synthetic recruiting platform",
      truncated: false,
      url: state.url,
      viewport: {
        height: syntheticViewportHeight,
        scrollY: noScroll,
        width: syntheticViewportWidth,
      },
    });
  }
  state.page = {
    bringToFront: () => Promise.resolve(),
    evaluate: snapshot,
    goto: (url: string) => {
      state.navigationCount += navigationIncrement;
      state.url = url;
      options.afterNavigation?.(state);
      return options.navigationError
        ? Promise.reject(options.navigationError)
        : Promise.resolve(null);
    },
    isClosed: () => false,
    locator: createSyntheticPageLocator({
      nth: () => ({}) as Locator,
      readSnapshot: snapshot,
      title: "Synthetic recruiting platform",
    }),
    once: () => state.page,
    title: () => Promise.resolve("Synthetic recruiting platform"),
    url: () => state.url,
  } as unknown as Page;
  return state;
}

export function syntheticBrowserContext(...pages: Page[]): BrowserContext {
  const context = {
    on: () => context,
    pages: () => pages,
  } as unknown as BrowserContext;
  return context;
}

export function syntheticBrowserContextWithNewPage(existing: Page, created: Page): BrowserContext {
  const context = {
    newPage: () => Promise.resolve(created),
    on: () => context,
    pages: () => [existing],
  } as unknown as BrowserContext;
  return context;
}
