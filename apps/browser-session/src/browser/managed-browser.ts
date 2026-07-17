import { chromium } from "patchright";
import type { BrowserContext } from "patchright";
import type { BrowserRuntimeStatus, PlatformAccessObservation } from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, completer, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

import type { BrowserControl } from "./browser-control.js";
import type { JobPostingWriter } from "#/workspace-service/job-posting-writer.js";
import type { SelectedJobSearchIntentReader } from "#/workspace-service/selected-job-search-intent-reader.js";
import { PassiveJobCollector } from "./passive-job-collector.js";
import { PlatformAccessObserver } from "./platform-access-observer.js";
import { BrowserToolExecutor } from "./tool-executor.js";

const initialFailureCount = 0;
const firstFailureCount = 1;
const minimumRetryExponent = 0;
const retryDelayBaseMilliseconds = 1000;
const retryDelayMaximumMilliseconds = 30_000;
const retryExponentMaximum = 5;
const retryExponentBase = 2;
const publicBrowserFailureMessage = "浏览器启动或运行失败。";

type PersistentContextLauncher = (profilePath: string) => Promise<BrowserContext>;

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

function launchPersistentContext(profilePath: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
  });
}

export class ManagedBrowser implements BrowserControl {
  readonly #launchContext: PersistentContextLauncher;
  readonly #profilePath: string;
  readonly #jobPostingWriter: JobPostingWriter;
  readonly #selectedIntentReader: SelectedJobSearchIntentReader;
  #context: BrowserContext | null = null;
  #platformAccessObserver: PlatformAccessObserver | null = null;
  #toolExecutor: BrowserToolExecutor | null = null;
  #hasFailed = false;

  public constructor(
    profilePath: string,
    selectedIntentReader: SelectedJobSearchIntentReader,
    jobPostingWriter: JobPostingWriter,
    launchContext: PersistentContextLauncher = launchPersistentContext,
  ) {
    this.#profilePath = profilePath;
    this.#selectedIntentReader = selectedIntentReader;
    this.#jobPostingWriter = jobPostingWriter;
    this.#launchContext = launchContext;
  }

  public get status(): BrowserRuntimeStatus {
    if (!this.#context || !this.#toolExecutor) {
      return {
        available: false,
        ...(this.#hasFailed ? { lastError: publicBrowserFailureMessage } : {}),
      };
    }
    const browserVersion = this.#context.browser()?.version();
    return {
      ...(browserVersion ? { browserVersion } : {}),
      available: true,
      tabCount: this.#toolExecutor.tabCount,
    };
  }

  public *executeTool(toolName: string, input: Record<string, unknown>): RiteCoroutine<unknown> {
    if (!this.#toolExecutor) {
      const detail = this.#hasFailed ? publicBrowserFailureMessage : "浏览器尚未就绪。";
      throw new Error(`浏览器暂不可用，Browser Session 正在启动或恢复。${detail}`);
    }
    return yield* this.#toolExecutor.execute(toolName, input);
  }

  public get platformAccessObservations(): PlatformAccessObservation[] {
    return this.#platformAccessObserver?.observations ?? [];
  }

  public *supervise(reportError: (error: Error) => void): RiteCoroutine<never> {
    let failureCount = initialFailureCount;
    while (true) {
      try {
        const closed = yield* this.#launchOnce(reportError);
        failureCount = this.#recordFailure(closed, initialFailureCount, reportError);
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        const launchError = error instanceof Error ? error : new Error(String(error));
        failureCount = this.#recordFailure(launchError, failureCount, reportError);
      }
      yield* sleep(retryDelay(failureCount));
    }
  }

  *#launchOnce(reportError: (error: Error) => void): RiteCoroutine<Error> {
    const context = yield* until(() => this.#launchContext(this.#profilePath));
    const closed = yield* completer<Error>();
    context.once("close", () => closed.resolve(new Error("浏览器窗口已经关闭。")));
    this.#context = context;
    const platformAccessObserver = new PlatformAccessObserver(context);
    const passiveJobCollector = new PassiveJobCollector(
      context,
      this.#selectedIntentReader,
      this.#jobPostingWriter,
      (page) => platformAccessObserver.observePage(page),
    );
    this.#platformAccessObserver = platformAccessObserver;
    this.#toolExecutor = new BrowserToolExecutor(context, (page) =>
      platformAccessObserver.observePage(page),
    );
    this.#hasFailed = false;
    try {
      return yield* race([
        () => platformAccessObserver.run(),
        () => passiveJobCollector.run(reportError),
        () => wait(closed.future),
      ]);
    } finally {
      this.#context = null;
      this.#platformAccessObserver = null;
      this.#toolExecutor = null;
      yield* until(() => context.close());
    }
  }

  #recordFailure(error: Error, failureCount: number, reportError: (error: Error) => void): number {
    this.#hasFailed = true;
    reportError(error);
    return failureCount + firstFailureCount;
  }
}

export type { PersistentContextLauncher };
