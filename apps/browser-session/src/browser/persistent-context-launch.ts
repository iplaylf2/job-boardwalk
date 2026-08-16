import { chromium } from "patchright";
import type { BrowserContext } from "patchright";

const launchOptionsArgumentIndex = 1;

type PersistentContextLaunchOptions = NonNullable<
  Parameters<typeof chromium.launchPersistentContext>[typeof launchOptionsArgumentIndex]
>;

export type BrowserChannel = "chrome" | "msedge";

interface BrowserLaunchOptions {
  readonly channel?: BrowserChannel;
  readonly executablePath?: string;
}

export function createPersistentContextLaunchOptions(
  options: BrowserLaunchOptions = {},
): PersistentContextLaunchOptions {
  return {
    chromiumSandbox: true,
    ...(options.channel ? { channel: options.channel } : {}),
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
    headless: false,
    viewport: null,
  };
}

export function launchPersistentContext(
  profilePath: string,
  options: BrowserLaunchOptions = {},
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(
    profilePath,
    createPersistentContextLaunchOptions(options),
  );
}
