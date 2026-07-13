import path from "node:path";
import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";

import { chromium } from "playwright";
import type { BrowserContext } from "playwright";
import { getAuthenticationDirectory } from "@job-boardwalk/storage-layout";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

import { platformBrowserConfigurations } from "./platform-browser-configurations.js";

export type PlatformPagePurpose = "browse" | "login";

const privateDirectoryMode = 0o700;
const firstPageIndex = 0;
const authenticationPollingMilliseconds = 1000;

export interface PlatformBrowser {
  close: () => Promise<void>;
  getAvailability: () => { available: boolean; executablePath: string };
  handoffToUser: (platformId: PlatformId, purpose: PlatformPagePurpose) => Promise<void>;
  hasOpenSession: (platformId: PlatformId) => boolean;
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

  public getAvailability(): { available: boolean; executablePath: string } {
    return { available: existsSync(this.#executablePath), executablePath: this.#executablePath };
  }

  public hasOpenSession(platformId: PlatformId): boolean {
    return this.#contexts.has(platformId);
  }

  public async handoffToUser(platformId: PlatformId, purpose: PlatformPagePurpose): Promise<void> {
    const configuration = platformBrowserConfigurations[platformId];
    const targetUrl = purpose === "login" ? configuration.loginUrl : configuration.browseUrl;
    const existingContext = this.#contexts.get(platformId);
    if (existingContext) {
      const page = await existingContext.newPage();
      await page.goto(targetUrl);
      await page.bringToFront();
      return;
    }

    const profilePath = path.join(getAuthenticationDirectory(), `${platformId}-profile`);
    await mkdir(profilePath, { mode: privateDirectoryMode, recursive: true });
    await chmod(profilePath, privateDirectoryMode);
    const context = await chromium.launchPersistentContext(profilePath, {
      headless: false,
    });
    this.#contexts.set(platformId, context);
    context.on("close", () => this.#contexts.delete(platformId));
    const page = context.pages().at(firstPageIndex) ?? (await context.newPage());
    await page.goto(targetUrl);
    await page.bringToFront();
    this.#observeAuthentication(platformId, context);
  }

  public async close(): Promise<void> {
    const contexts = [...this.#contexts.values()];
    this.#contexts.clear();
    await Promise.all(contexts.map((context) => context.close()));
  }

  #observeAuthentication(platformId: PlatformId, context: BrowserContext): void {
    const { requiredCookieNames } = platformBrowserConfigurations[platformId];
    const poll = async (): Promise<void> => {
      if (!this.#contexts.has(platformId)) {
        return;
      }
      const cookies = await context.cookies();
      const cookieNames = new Set(cookies.map((cookie) => cookie.name));
      if (requiredCookieNames.every((name) => cookieNames.has(name))) {
        this.#onAuthenticationObserved(platformId, new Date().toISOString());
        return;
      }
      setTimeout(() => {
        poll().catch(() => null);
      }, authenticationPollingMilliseconds);
    };
    poll().catch(() => null);
  }
}
