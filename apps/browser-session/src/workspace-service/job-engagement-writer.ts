import type {
  JobEngagementSnapshot,
  SynchronizeJobEngagementResult,
} from "@job-boardwalk/contracts";
import { SynchronizeJobEngagementResult as SynchronizeJobEngagementResultContract } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export interface JobEngagementWriter {
  write: (snapshot: JobEngagementSnapshot) => RiteCoroutine<SynchronizeJobEngagementResult>;
}

export class WorkspaceJobEngagementWriter implements JobEngagementWriter {
  readonly #endpoint: URL;
  readonly #fetch: typeof fetch;

  public constructor(workspaceServiceUrl: URL, fetchImplementation: typeof fetch = fetch) {
    this.#endpoint = new URL("/api/job-engagements", workspaceServiceUrl);
    this.#fetch = fetchImplementation;
  }

  public *write(snapshot: JobEngagementSnapshot): RiteCoroutine<SynchronizeJobEngagementResult> {
    const response = yield* until(() =>
      this.#fetch(this.#endpoint, {
        body: JSON.stringify({
          ...snapshot,
          initiatedBy: "system",
          reason: `Browser Session 同步平台个人中心岗位跟进：${snapshot.engagement}`,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    );
    if (!response.ok) {
      throw new Error(`Workspace Service 拒绝岗位跟进快照：HTTP ${String(response.status)}`);
    }
    return SynchronizeJobEngagementResultContract.assert(yield* until(() => response.json()));
  }
}
