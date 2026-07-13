import path from "node:path";
import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";

import { chromium } from "playwright";
import type { BrowserContext } from "playwright";
import type {
  OpenPlatformBrowserPurpose,
  PlatformBrowserAvailability,
} from "@job-boardwalk/contracts";
import { getAuthenticationDirectory } from "@job-boardwalk/storage-layout";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { all, spawn, wait } from "@shajara/host/primitives";

import { platformBrowserConfigurations } from "./platform-browser-configurations.js";

const privateDirectoryMode = 0o700;
const firstPageIndex = 0;
const authenticationPollIntervalMilliseconds = 1000;

function* tryReadCookies(
  context: BrowserContext,
): RiteCoroutine<Awaited<ReturnType<BrowserContext["cookies"]>> | null> {
  try {
    return yield* until(() => context.cookies());
  } catch {
    return null;
  }
}

export interface PlatformBrowser {
  close: () => RiteCoroutine<void>;
  getAvailability: () => PlatformBrowserAvailability;
  hasOpenSession: (platformId: PlatformId) => boolean;
  open: (platformId: PlatformId, purpose: OpenPlatformBrowserPurpose) => RiteCoroutine<void>;
}

export class PlaywrightPlatformBrowser implements PlatformBrowser {
  readonly #contexts = new Map<PlatformId, BrowserContext>();
  readonly #executablePath = chromium.executablePath();
  readonly #onAuthenticationObserved: (platformId: PlatformId, observedAt: string) => void;

  public constructor(
    onAuthenticationObserved: (platformId: PlatformId, observedAt: string) => void = () => null,
  ) {
    this.#onAuthenticationObserved = onAuthenticationObserved;
  }

  public getAvailability(): PlatformBrowserAvailability {
    return { available: existsSync(this.#executablePath), executablePath: this.#executablePath };
  }

  public hasOpenSession(platformId: PlatformId): boolean {
    return this.#contexts.has(platformId);
  }

  public *open(platformId: PlatformId, purpose: OpenPlatformBrowserPurpose): RiteCoroutine<void> {
    const configuration = platformBrowserConfigurations[platformId];
    const targetUrl = purpose === "login" ? configuration.loginUrl : configuration.browseUrl;
    const existingContext = this.#contexts.get(platformId);
    if (existingContext) {
      const page = yield* until(() => existingContext.newPage());
      yield* until(() => page.goto(targetUrl));
      yield* until(() => page.bringToFront());
      return;
    }

    const profilePath = path.join(getAuthenticationDirectory(), `${platformId}-profile`);
    yield* until(() => mkdir(profilePath, { mode: privateDirectoryMode, recursive: true }));
    yield* until(() => chmod(profilePath, privateDirectoryMode));
    const context = yield* until(() =>
      chromium.launchPersistentContext(profilePath, { headless: false }),
    );
    this.#contexts.set(platformId, context);
    context.on("close", () => this.#contexts.delete(platformId));
    const page = context.pages().at(firstPageIndex) ?? (yield* until(() => context.newPage()));
    yield* until(() => page.goto(targetUrl));
    yield* until(() => page.bringToFront());
    yield* spawn(() => this.#watchAuthentication(platformId, context));
  }

  public *close(): RiteCoroutine<void> {
    const contexts = [...this.#contexts.values()];
    this.#contexts.clear();
    const closedContexts = yield* all(
      contexts.map(
        (context) =>
          function* closeContext() {
            yield* until(() => context.close());
          },
      ),
    );
    yield* wait(closedContexts);
  }

  *#watchAuthentication(platformId: PlatformId, context: BrowserContext): RiteCoroutine<void> {
    const { requiredCookieNames } = platformBrowserConfigurations[platformId];
    while (this.#contexts.has(platformId)) {
      const cookies = yield* tryReadCookies(context);
      if (cookies === null) {
        return;
      }
      const cookieNames = new Set(cookies.map((cookie) => cookie.name));
      if (requiredCookieNames.every((name) => cookieNames.has(name))) {
        this.#onAuthenticationObserved(platformId, new Date().toISOString());
        return;
      }
      yield* sleep(authenticationPollIntervalMilliseconds);
    }
  }
}
