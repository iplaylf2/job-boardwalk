import type { RecommendationPageReference, WorkspaceOverview } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export interface SelectedRecommendationPageReader {
  read: () => RiteCoroutine<RecommendationPageReference[]>;
}

export class WorkspaceSelectedRecommendationPageReader implements SelectedRecommendationPageReader {
  readonly #endpoint: URL;
  readonly #fetch: typeof fetch;

  public constructor(workspaceServiceUrl: URL, fetchImplementation: typeof fetch = fetch) {
    this.#endpoint = new URL("/api/workspace/overview", workspaceServiceUrl);
    this.#fetch = fetchImplementation;
  }

  public *read(): RiteCoroutine<RecommendationPageReference[]> {
    const response = yield* until(() => this.#fetch(this.#endpoint));
    if (!response.ok) {
      throw new Error(`Workspace Service 拒绝推荐页读取：HTTP ${String(response.status)}`);
    }
    const overview = yield* until(() => response.json() as Promise<WorkspaceOverview>);
    return overview.jobSearchIntents.find(({ selected }) => selected)?.recommendationPages ?? [];
  }
}
