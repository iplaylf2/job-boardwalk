import type { JobSearchIntent, WorkspaceOverview } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export interface SelectedJobSearchIntentReader {
  read: () => RiteCoroutine<JobSearchIntent | null>;
}

export class WorkspaceSelectedJobSearchIntentReader implements SelectedJobSearchIntentReader {
  readonly #endpoint: URL;
  readonly #fetch: typeof fetch;

  public constructor(workspaceServiceUrl: URL, fetchImplementation: typeof fetch = fetch) {
    this.#endpoint = new URL("/api/workspace/overview", workspaceServiceUrl);
    this.#fetch = fetchImplementation;
  }

  public *read(): RiteCoroutine<JobSearchIntent | null> {
    const response = yield* until(() => this.#fetch(this.#endpoint));
    if (!response.ok) {
      throw new Error(`Workspace Service 拒绝求职方向读取：HTTP ${String(response.status)}`);
    }
    const overview = yield* until(() => response.json() as Promise<WorkspaceOverview>);
    return overview.jobSearchIntents.find(({ selected }) => selected) ?? null;
  }
}
