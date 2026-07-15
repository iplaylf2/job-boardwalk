import process from "node:process";

import type { BrowserRuntimeStatus, BrowserSessionStatusReport } from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const defaultWorkspaceServiceUrl = "http://127.0.0.1:54310";
const reportingIntervalMilliseconds = 5000;

type StatusReader = () => BrowserRuntimeStatus;

export function resolveWorkspaceServiceUrl(environment: NodeJS.ProcessEnv = process.env): URL {
  const configuredUrl = environment["JOB_BOARDWALK_WORKSPACE_SERVICE_URL"]?.trim();
  const url = new URL(configuredUrl || defaultWorkspaceServiceUrl);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("JOB_BOARDWALK_WORKSPACE_SERVICE_URL 必须是无凭据的 HTTP(S) URL");
  }
  return url;
}

export class BrowserSessionStatusReporter {
  readonly #fetch: typeof fetch;
  readonly #readStatus: StatusReader;
  readonly #statusEndpoint: URL;

  public constructor(
    workspaceServiceUrl: URL,
    readStatus: StatusReader,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.#fetch = fetchImplementation;
    this.#readStatus = readStatus;
    this.#statusEndpoint = new URL("/api/browser-session/status", workspaceServiceUrl);
  }

  public *report(): RiteCoroutine<void> {
    const report = {
      browserStatus: this.#readStatus(),
    } satisfies BrowserSessionStatusReport;
    const response = yield* until(() =>
      this.#fetch(this.#statusEndpoint, {
        body: JSON.stringify(report),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    );
    if (!response.ok) {
      throw new Error(`Workspace Service 拒绝浏览器状态报告：HTTP ${String(response.status)}`);
    }
  }

  public *run(reportError: (error: Error) => void): RiteCoroutine<never> {
    while (true) {
      try {
        yield* this.report();
      } catch (error) {
        if (error instanceof CanceledError || error instanceof ScopeError) {
          throw error;
        }
        reportError(error instanceof Error ? error : new Error(String(error)));
      }
      yield* sleep(reportingIntervalMilliseconds);
    }
  }
}
