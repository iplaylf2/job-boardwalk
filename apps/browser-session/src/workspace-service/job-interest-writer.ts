import type { JobInterestSnapshot, SynchronizeJobInterestsResult } from "@job-boardwalk/contracts";
import { SynchronizeJobInterestsResult as SynchronizeJobInterestsResultContract } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export interface JobInterestWriter {
  write: (snapshot: JobInterestSnapshot) => RiteCoroutine<SynchronizeJobInterestsResult>;
}

export class WorkspaceJobInterestWriter implements JobInterestWriter {
  readonly #endpoint: URL;
  readonly #fetch: typeof fetch;

  public constructor(workspaceServiceUrl: URL, fetchImplementation: typeof fetch = fetch) {
    this.#endpoint = new URL("/api/job-interests", workspaceServiceUrl);
    this.#fetch = fetchImplementation;
  }

  public *write(snapshot: JobInterestSnapshot): RiteCoroutine<SynchronizeJobInterestsResult> {
    const response = yield* until(() =>
      this.#fetch(this.#endpoint, {
        body: JSON.stringify({
          ...snapshot,
          initiatedBy: "system",
          reason: "Browser Session 同步平台当前的“感兴趣”岗位列表",
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    );
    if (!response.ok) {
      throw new Error(`Workspace Service 拒绝岗位兴趣快照：HTTP ${String(response.status)}`);
    }
    return SynchronizeJobInterestsResultContract.assert(yield* until(() => response.json()));
  }
}
