import type { JobPostingObservation } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export interface JobPostingWriter {
  write: (observation: JobPostingObservation) => RiteCoroutine<void>;
}

export class WorkspaceJobPostingWriter implements JobPostingWriter {
  readonly #endpoint: URL;
  readonly #fetch: typeof fetch;

  public constructor(workspaceServiceUrl: URL, fetchImplementation: typeof fetch = fetch) {
    this.#endpoint = new URL("/api/jobs", workspaceServiceUrl);
    this.#fetch = fetchImplementation;
  }

  public *write(observation: JobPostingObservation): RiteCoroutine<void> {
    const response = yield* until(() =>
      this.#fetch(this.#endpoint, {
        body: JSON.stringify({
          ...observation,
          initiatedBy: "system",
          reason: "Browser Session 被动采集当前页面已展示的岗位",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    if (!response.ok) {
      throw new Error(`Workspace Service 拒绝岗位观察：HTTP ${String(response.status)}`);
    }
  }
}
