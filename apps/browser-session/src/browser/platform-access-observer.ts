import type { BrowserContext, Request, Response } from "patchright";
import type { PlatformAccessObservation } from "@job-boardwalk/contracts";
import { completer } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import type { PageAccessFacts } from "./recruiting-platform-adapters.js";
import { findRecruitingPlatformAdapter } from "./recruiting-platform-adapters.js";

function collectRedirectSourceUrls(request: Request): string[] {
  const urls: string[] = [];
  let redirectedFrom = request.redirectedFrom();
  while (redirectedFrom) {
    urls.push(redirectedFrom.url());
    redirectedFrom = redirectedFrom.redirectedFrom();
  }
  return urls;
}

export function deriveNavigationAccessObservation(
  response: Response,
  now: () => number = Date.now,
): PlatformAccessObservation | null {
  const request = response.request();
  if (!request.isNavigationRequest() || response.frame().parentFrame()) {
    return null;
  }

  const adapter = findRecruitingPlatformAdapter(response.url());
  const assessment = adapter?.assessNavigation?.({
    ok: response.ok(),
    redirectSourceUrls: collectRedirectSourceUrls(request),
    url: response.url(),
  });
  if (!adapter || !assessment) {
    return null;
  }
  return {
    observedAt: new Date(now()).toISOString(),
    platformId: adapter.platformId,
    ...assessment,
  };
}

export function derivePageAccessObservation(
  page: PageAccessFacts,
  now: () => number = Date.now,
): PlatformAccessObservation | null {
  const adapter = findRecruitingPlatformAdapter(page.url);
  const assessment = adapter?.assessPage?.(page);
  if (!adapter || !assessment) {
    return null;
  }
  return {
    observedAt: new Date(now()).toISOString(),
    platformId: adapter.platformId,
    ...assessment,
  };
}

export class PlatformAccessObserver {
  readonly #context: BrowserContext;
  #observations: PlatformAccessObservation[] = [];

  public constructor(context: BrowserContext) {
    this.#context = context;
  }

  public get observations(): PlatformAccessObservation[] {
    return [...this.#observations];
  }

  public observePage(page: PageAccessFacts): PlatformAccessObservation | null {
    const observation = derivePageAccessObservation(page);
    if (observation) {
      this.#record(observation);
    }
    return observation;
  }

  public *run(): RiteCoroutine<never> {
    const running = yield* completer<never>();
    this.#context.on("response", (response) => {
      const observation = deriveNavigationAccessObservation(response);
      if (!observation) {
        return;
      }
      this.#record(observation);
    });
    return yield* wait(running.future);
  }

  #record(observation: PlatformAccessObservation): void {
    this.#observations = [
      ...this.#observations.filter(({ platformId }) => platformId !== observation.platformId),
      observation,
    ];
  }
}
