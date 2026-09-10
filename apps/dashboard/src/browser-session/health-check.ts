import { BrowserSessionHealth } from "@job-boardwalk/contracts";
import type { BrowserRuntimeStatus } from "@job-boardwalk/contracts";
import {
  CanceledError,
  InterruptedError,
  ScopeError,
  abortSignal,
  sleep,
  until,
} from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race } from "@shajara/host/primitives";

const checkDeadlineMilliseconds = 3000;

export type BrowserSessionCheckResult =
  | { outcome: "observed"; browser: BrowserRuntimeStatus; checkedAt: string }
  | { outcome: "unconfigured" | "configuration-error" | "failed"; checkedAt: string };

function* fetchResponse(url: string): RiteCoroutine<Response> {
  const signal = yield* abortSignal();
  return yield* until(() => fetch(url, { cache: "no-store", credentials: "omit", signal }));
}

function parseServiceOrigin(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const url = new URL(trimmed);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new TypeError("Browser Session origin must be a loopback HTTP(S) origin");
  }
  return url;
}

function* readServiceHealth(): RiteCoroutine<BrowserSessionCheckResult> {
  const configuration = yield* fetchResponse("/browser-session/origin");
  if (!configuration.ok) {
    return { checkedAt: new Date().toISOString(), outcome: "configuration-error" };
  }
  const configuredOrigin = yield* until(() => configuration.text());
  // eslint-disable-next-line init-declarations -- A parse failure returns before the serviceOrigin is read.
  let serviceOrigin: URL | null;
  try {
    serviceOrigin = parseServiceOrigin(configuredOrigin);
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
    return { checkedAt: new Date().toISOString(), outcome: "configuration-error" };
  }
  if (!serviceOrigin) {
    return { checkedAt: new Date().toISOString(), outcome: "unconfigured" };
  }
  const response = yield* fetchResponse(new URL("/health", serviceOrigin).href);
  if (!response.ok) {
    return { checkedAt: new Date().toISOString(), outcome: "failed" };
  }
  const health = BrowserSessionHealth.assert(yield* until(() => response.json()));
  return { browser: health.browser, checkedAt: new Date().toISOString(), outcome: "observed" };
}

function* checkDeadline(): RiteCoroutine<BrowserSessionCheckResult> {
  yield* sleep(checkDeadlineMilliseconds);
  return { checkedAt: new Date().toISOString(), outcome: "failed" };
}

function* captureCheckResult(): RiteCoroutine<BrowserSessionCheckResult> {
  try {
    return yield* readServiceHealth();
  } catch (error) {
    if (
      error instanceof CanceledError ||
      error instanceof InterruptedError ||
      error instanceof ScopeError
    ) {
      throw error;
    }
    return { checkedAt: new Date().toISOString(), outcome: "failed" };
  }
}

export function* checkBrowserSession(): RiteCoroutine<BrowserSessionCheckResult> {
  return yield* race([captureCheckResult, checkDeadline]);
}
