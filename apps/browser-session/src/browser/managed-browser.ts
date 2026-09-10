import process from "node:process";
import type { BrowserContext, Page } from "patchright";
import type { BrowserRuntimeStatus, PlatformAccessObservation } from "@job-boardwalk/contracts";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { CanceledError, ScopeError, completer, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

import type { BrowserControl } from "./browser-control.js";
import type { JobObservationWriter } from "#/workspace-service/job-observation-writer.js";
import type { JobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";
import { BackgroundCollectionControl } from "./background-collection-control.js";
import { BrowserTabs } from "./browser-tabs.js";
import { JobEngagementCollector } from "./job-engagement/collector.js";
import { PassiveJobObservationCollector } from "./job-observation/passive-collector.js";
import { PlatformAccessObserver } from "./platform-access-observer.js";
import { launchPersistentContext } from "./persistent-context-launch.js";
import type { BrowserChannel } from "./persistent-context-launch.js";
import type { PageAccessFacts } from "#/browser/platforms/types.js";
import { BrowserToolExecutor } from "./tool-executor.js";

const initialFailureCount = 0;
const initialReturnedControlRevision = 0;
const firstFailureCount = 1;
const nextReturnedControl = 1;
const retryDelayBaseMilliseconds = 1000;
const retryDelayMaximumMilliseconds = 30_000;
const retryExponentBase = 2;
const publicBrowserFailureMessage = "浏览器启动或运行失败。";

type PersistentContextLauncher = (profilePath: string) => Promise<BrowserContext>;

function retryDelay(failureCount: number): number {
  return Math.min(
    retryDelayMaximumMilliseconds,
    retryDelayBaseMilliseconds * retryExponentBase ** (failureCount - firstFailureCount),
  );
}

function coordinateCollection(
  context: BrowserContext,
  collectionControl: BackgroundCollectionControl,
  platformAccessObserver: PlatformAccessObserver,
) {
  const browserTabs = new BrowserTabs(context);
  return {
    browserTabs,
    collectionControl,
    observePageAccess(page: PageAccessFacts) {
      return platformAccessObserver.observePage(page);
    },
    selectPage: (page: Page) => browserTabs.selectPage(page),
  };
}

export class ManagedBrowser implements BrowserControl {
  readonly #persistentContextLauncher: PersistentContextLauncher;
  readonly #profilePath: string;
  readonly #jobEngagementWriter: JobEngagementWriter;
  readonly #jobObservationWriter: JobObservationWriter;
  #context: BrowserContext | null = null;
  readonly #returnedControlRevisions = new Map<PlatformId, number>();
  #platformAccessObserver: PlatformAccessObserver | null = null;
  #toolExecutor: BrowserToolExecutor | null = null;
  #lifecycle: Extract<BrowserRuntimeStatus, { available: false }>["lifecycle"] = {
    phase: "starting",
    phaseStartedAt: new Date().toISOString(),
  };

  public constructor(
    profilePath: string,
    dependencies: {
      browserChannel?: BrowserChannel;
      browserExecutablePath?: string;
      jobEngagementWriter: JobEngagementWriter;
      jobObservationWriter: JobObservationWriter;
    },
    persistentContextLauncher: PersistentContextLauncher = (profilePath_) => {
      const browserExecutablePath =
        dependencies.browserExecutablePath ??
        process.env["JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH"]?.trim();
      return launchPersistentContext(profilePath_, {
        ...(dependencies.browserChannel ? { channel: dependencies.browserChannel } : {}),
        ...(!dependencies.browserChannel && browserExecutablePath
          ? { executablePath: browserExecutablePath }
          : {}),
      });
    },
  ) {
    this.#profilePath = profilePath;
    this.#jobObservationWriter = dependencies.jobObservationWriter;
    this.#jobEngagementWriter = dependencies.jobEngagementWriter;
    this.#persistentContextLauncher = persistentContextLauncher;
  }

  public get status(): BrowserRuntimeStatus {
    if (!this.#context || !this.#toolExecutor) {
      return {
        available: false,
        lifecycle: this.#lifecycle,
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
      const detail = this.#lifecycle.lastFailure ? publicBrowserFailureMessage : "浏览器尚未就绪。";
      throw new Error(`浏览器暂不可用。${detail}`);
    }
    return yield* this.#toolExecutor.execute(toolName, input);
  }

  public get platformAccessObservations(): PlatformAccessObservation[] {
    return this.#platformAccessObserver?.observations ?? [];
  }

  public *supervise(
    reportError: (error: Error) => void,
    reportLifecycle: (status: BrowserRuntimeStatus) => void = () => null,
  ): RiteCoroutine<never> {
    let failureCount = initialFailureCount;
    try {
      while (true) {
        this.#setPhase("starting", reportLifecycle);
        try {
          const closed = yield* this.#runBrowserAttempt(reportError, reportLifecycle);
          // Cancellation can unwind the attempt without a close result; shutdown must not retry.
          if (!closed) {
            throw new CanceledError();
          }
          failureCount = recordFailure(closed, initialFailureCount, reportError);
        } catch (error) {
          if (error instanceof CanceledError || error instanceof ScopeError) {
            throw error;
          }
          const runtimeError = error instanceof Error ? error : new Error(String(error));
          this.#lifecycle = {
            ...this.#lifecycle,
            lastFailure: {
              category: this.#lifecycle.phase === "starting" ? "launch-failed" : "runtime-failed",
              occurredAt: new Date().toISOString(),
            },
          };
          failureCount = recordFailure(runtimeError, failureCount, reportError);
        }
        const delay = retryDelay(failureCount);
        this.#setPhase("retry-wait", reportLifecycle, new Date(Date.now() + delay).toISOString());
        yield* sleep(delay);
      }
    } finally {
      this.#setPhase("stopped", reportLifecycle);
    }
  }

  #setPhase(
    phase: Extract<BrowserRuntimeStatus, { available: false }>["lifecycle"]["phase"],
    reportLifecycle: (status: BrowserRuntimeStatus) => void,
    nextAttemptAt?: string,
  ): void {
    this.#lifecycle = {
      phase,
      phaseStartedAt: new Date().toISOString(),
      ...(this.#lifecycle.lastFailure ? { lastFailure: this.#lifecycle.lastFailure } : {}),
      ...(nextAttemptAt ? { nextAttemptAt } : {}),
    };
    reportLifecycle(this.status);
  }

  *#runBrowserAttempt(
    reportError: (error: Error) => void,
    reportLifecycle: (status: BrowserRuntimeStatus) => void,
  ): RiteCoroutine<Error> {
    const context = yield* until(() => this.#persistentContextLauncher(this.#profilePath));
    try {
      return yield* this.#runContext(context, reportError, reportLifecycle);
    } finally {
      this.#context = null;
      this.#platformAccessObserver = null;
      this.#toolExecutor = null;
      if (this.#lifecycle.phase !== "closing") {
        this.#setPhase("closing", reportLifecycle);
      }
      yield* until(() => context.close());
    }
  }

  *#runContext(
    context: BrowserContext,
    reportError: (error: Error) => void,
    reportLifecycle: (status: BrowserRuntimeStatus) => void,
  ): RiteCoroutine<Error> {
    this.#returnedControlRevisions.clear();
    const closed = yield* completer<Error>();
    context.once("close", () => {
      this.#recordWindowClosed(reportLifecycle);
      closed.resolve(new Error("浏览器窗口已经关闭。"));
    });
    this.#context = context;
    const platformAccessObserver = new PlatformAccessObserver(context);
    const collectionControl = new BackgroundCollectionControl();
    const coordination = coordinateCollection(context, collectionControl, platformAccessObserver);
    const jobObservationCollector = new PassiveJobObservationCollector(
      context,
      this.#jobObservationWriter,
      coordination,
    );
    const jobEngagementCollector = new JobEngagementCollector(
      context,
      this.#jobEngagementWriter,
      (platformId) =>
        this.#returnedControlRevisions.get(platformId) ?? initialReturnedControlRevision,
      coordination,
    );
    this.#platformAccessObserver = platformAccessObserver;
    this.#toolExecutor = new BrowserToolExecutor(
      coordination.browserTabs,
      coordination.observePageAccess,
      collectionControl,
      {
        recordReturnedControl: (platformId) => this.#recordReturnedControl(platformId),
        synchronizeJobEngagement: (platformId, engagement) =>
          jobEngagementCollector.synchronize(platformId, engagement),
        writeJobDescriptionObservation: (...input) =>
          this.#jobObservationWriter.writeDescriptionObservation(...input),
      },
    );
    reportLifecycle(this.status);
    const result = yield* race([
      () => platformAccessObserver.run(),
      () => jobObservationCollector.run(reportError),
      () => wait(closed.future),
    ]);
    return result;
  }

  #recordWindowClosed(reportLifecycle: (status: BrowserRuntimeStatus) => void): void {
    if (this.#lifecycle.phase !== "closing") {
      this.#lifecycle = {
        ...this.#lifecycle,
        lastFailure: { category: "window-closed", occurredAt: new Date().toISOString() },
      };
      this.#toolExecutor = null;
      this.#setPhase("closing", reportLifecycle);
    }
  }

  #recordReturnedControl(platformId: PlatformId): void {
    const currentRevision =
      this.#returnedControlRevisions.get(platformId) ?? initialReturnedControlRevision;
    this.#returnedControlRevisions.set(platformId, currentRevision + nextReturnedControl);
  }
}

function recordFailure(
  error: Error,
  failureCount: number,
  reportError: (error: Error) => void,
): number {
  reportError(error);
  return failureCount + firstFailureCount;
}
