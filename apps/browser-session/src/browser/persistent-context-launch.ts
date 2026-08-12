import { chromium } from "patchright";
import type { BrowserContext } from "patchright";

const launchOptionsArgumentIndex = 1;

type PersistentContextLaunchOptions = NonNullable<
  Parameters<typeof chromium.launchPersistentContext>[typeof launchOptionsArgumentIndex]
>;

export function createPersistentContextLaunchOptions(
  browserExecutablePath?: string,
): PersistentContextLaunchOptions {
  return {
    chromiumSandbox: true,
    ...(browserExecutablePath ? { executablePath: browserExecutablePath } : {}),
    headless: false,
    viewport: null,
  };
}

export function launchPersistentContext(
  profilePath: string,
  browserExecutablePath?: string,
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(
    profilePath,
    createPersistentContextLaunchOptions(browserExecutablePath),
  );
}
