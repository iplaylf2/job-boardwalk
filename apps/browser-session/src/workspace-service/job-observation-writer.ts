import type { JobCardObservation, JobDescriptionObservation } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export interface JobObservationWriter {
  writeCardObservation: (observation: JobCardObservation) => RiteCoroutine<void>;
  writeDescriptionObservation: (observation: JobDescriptionObservation) => RiteCoroutine<void>;
}

export class WorkspaceJobObservationWriter implements JobObservationWriter {
  readonly #cardEndpoint: URL;
  readonly #descriptionEndpoint: URL;
  readonly #fetch: typeof fetch;

  public constructor(workspaceServiceUrl: URL, fetchImplementation: typeof fetch = fetch) {
    this.#cardEndpoint = new URL("/api/job-card-observations", workspaceServiceUrl);
    this.#descriptionEndpoint = new URL("/api/job-description-observations", workspaceServiceUrl);
    this.#fetch = fetchImplementation;
  }

  public *writeCardObservation(observation: JobCardObservation): RiteCoroutine<void> {
    yield* this.#write(this.#cardEndpoint, observation);
  }

  public *writeDescriptionObservation(observation: JobDescriptionObservation): RiteCoroutine<void> {
    yield* this.#write(this.#descriptionEndpoint, observation);
  }

  *#write(
    endpoint: URL,
    observation: JobCardObservation | JobDescriptionObservation,
  ): RiteCoroutine<void> {
    const response = yield* until(() =>
      this.#fetch(endpoint, {
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
