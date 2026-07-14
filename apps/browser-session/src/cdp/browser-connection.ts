import { chromium } from "patchright";
import type { Browser } from "patchright";
import { CanceledError, ScopeError, completer, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import type { BrowserBackendStatus, BrowserToolBackend } from "#/browser/tool-backend.js";
import { BrowserToolRuntime } from "#/browser/tool-runtime.js";

const connectionTimeoutMilliseconds = 10_000;
const initialFailureCount = 0;
const firstFailureCount = 1;
const minimumRetryExponent = 0;
const retryDelayBaseMilliseconds = 1000;
const retryDelayMaximumMilliseconds = 30_000;
const retryExponentMaximum = 5;
const retryExponentBase = 2;

const browserSessionCdpOrigin = "http://localhost";

interface DetachableBrowser extends Browser {
  _connection: { close: (cause?: string) => void };
}

type BrowserConnector = (endpoint: URL) => Promise<Browser>;

function retryDelay(failureCount: number): number {
  const exponent = Math.min(
    Math.max(failureCount - firstFailureCount, minimumRetryExponent),
    retryExponentMaximum,
  );
  return Math.min(
    retryDelayMaximumMilliseconds,
    retryDelayBaseMilliseconds * retryExponentBase ** exponent,
  );
}

function connectBrowserWithPatchright(endpoint: URL): Promise<Browser> {
  return chromium.connectOverCDP(endpoint.toString(), {
    headers: { Origin: browserSessionCdpOrigin },
    noDefaults: true,
    timeout: connectionTimeoutMilliseconds,
  });
}

function detachPatchrightClient(browser: Browser): void {
  // Patchright has no public CDP detach API. Browser.close() sends Browser.close and terminates
  // The user-owned graphical browser must remain open, so only the local client transport closes.
  // eslint-disable-next-line no-underscore-dangle
  (browser as DetachableBrowser)._connection.close("Job Boardwalk Browser Session detached");
}

export class CdpBrowserConnection implements BrowserToolBackend {
  readonly #connectBrowser: BrowserConnector;
  readonly #endpoint: URL;
  #browser: Browser | null = null;
  #toolRuntime: BrowserToolRuntime | null = null;
  #lastError: Error | null = null;

  public constructor(
    endpoint: URL,
    connectBrowser: BrowserConnector = connectBrowserWithPatchright,
  ) {
    this.#endpoint = new URL(endpoint);
    this.#connectBrowser = connectBrowser;
  }

  public get status(): BrowserBackendStatus {
    if (!this.#browser || !this.#toolRuntime) {
      return {
        connected: false,
        ...(this.#lastError ? { lastError: this.#lastError.message } : {}),
        origin: browserSessionCdpOrigin,
      };
    }
    return {
      browserVersion: this.#browser.version(),
      connected: true,
      origin: browserSessionCdpOrigin,
      pageCount: this.#toolRuntime.pageCount,
    };
  }

  public *execute(toolName: string, input: Record<string, unknown>): RiteCoroutine<unknown> {
    if (!this.#toolRuntime) {
      const detail = this.#lastError
        ? `最近一次失败：${this.#lastError.message}`
        : "连接尚未就绪。";
      throw new Error(`浏览器暂不可用，Browser Session 正在重新连接。${detail}`);
    }
    return yield* this.#toolRuntime.execute(toolName, input);
  }

  public *supervise(reportError: (error: Error) => void): RiteCoroutine<never> {
    let failureCount = initialFailureCount;
    while (true) {
      try {
        const disconnection = yield* this.#connectOnce();
        failureCount = this.#recordFailure(disconnection, initialFailureCount, reportError);
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        const connectionError = error instanceof Error ? error : new Error(String(error));
        failureCount = this.#recordFailure(connectionError, failureCount, reportError);
      }
      yield* sleep(retryDelay(failureCount));
    }
  }

  *#connectOnce(): RiteCoroutine<Error> {
    const browser = yield* until(() => this.#connectBrowser(this.#endpoint));
    const disconnected = yield* completer<Error>();
    browser.once("disconnected", () => disconnected.resolve(new Error("CDP 浏览器连接已经断开。")));
    this.#browser = browser;
    this.#toolRuntime = new BrowserToolRuntime(browser);
    this.#lastError = null;
    try {
      return yield* wait(disconnected.future);
    } finally {
      this.#browser = null;
      this.#toolRuntime = null;
      detachPatchrightClient(browser);
    }
  }

  #recordFailure(error: Error, failureCount: number, reportError: (error: Error) => void): number {
    this.#lastError = error;
    reportError(error);
    return failureCount + firstFailureCount;
  }
}

export type { BrowserConnector };
