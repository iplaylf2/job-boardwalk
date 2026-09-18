import { chromium } from "patchright";
import type { BrowserContext } from "patchright";

export type BrowserChannel = "chrome" | "msedge";
export type BrowserGraphicsBackend = "default" | "swiftshader";

interface BrowserLaunchOptions {
  readonly channel?: BrowserChannel;
  readonly executablePath?: string;
  readonly graphicsBackend?: BrowserGraphicsBackend;
}

export function launchPersistentContext(
  profilePath: string,
  options: BrowserLaunchOptions = {},
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profilePath, {
    ...(options.graphicsBackend === "swiftshader"
      ? { args: ["--use-gl=angle", "--use-angle=swiftshader"] }
      : {}),
    chromiumSandbox: true,
    ...(options.channel ? { channel: options.channel } : {}),
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
    headless: false,
    viewport: null,
  });
}
