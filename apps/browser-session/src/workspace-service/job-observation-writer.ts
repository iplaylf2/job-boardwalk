import type {
  JobCardObservation,
  JobDescriptionObservation,
  SaveJobObservationResult,
  WorkspaceChangeAttribution,
} from "@job-boardwalk/contracts";
import { SaveJobObservationResult as SaveJobObservationResultContract } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export interface JobObservationWriter {
  writeCardObservation: (
    observation: JobCardObservation,
    attribution: WorkspaceChangeAttribution,
  ) => RiteCoroutine<JobObservationWriteResult>;
  writeDescriptionObservation: (
    observation: JobDescriptionObservation,
    attribution: WorkspaceChangeAttribution,
  ) => RiteCoroutine<JobObservationWriteResult>;
}

type JobObservationWriteResult = Pick<SaveJobObservationResult, "outcome">;

export class WorkspaceJobObservationWriter implements JobObservationWriter {
  readonly #cardEndpoint: URL;
  readonly #descriptionEndpoint: URL;
  readonly #fetch: typeof fetch;

  public constructor(workspaceServiceUrl: URL, fetchImplementation: typeof fetch = fetch) {
    this.#cardEndpoint = new URL("/api/job-card-observations", workspaceServiceUrl);
    this.#descriptionEndpoint = new URL("/api/job-description-observations", workspaceServiceUrl);
    this.#fetch = fetchImplementation;
  }

  public *writeCardObservation(
    observation: JobCardObservation,
    attribution: WorkspaceChangeAttribution,
  ): RiteCoroutine<SaveJobObservationResult> {
    return yield* this.#write(this.#cardEndpoint, observation, attribution);
  }

  public *writeDescriptionObservation(
    observation: JobDescriptionObservation,
    attribution: WorkspaceChangeAttribution,
  ): RiteCoroutine<SaveJobObservationResult> {
    return yield* this.#write(this.#descriptionEndpoint, observation, attribution);
  }

  *#write(
    endpoint: URL,
    observation: JobCardObservation | JobDescriptionObservation,
    attribution: WorkspaceChangeAttribution,
  ): RiteCoroutine<SaveJobObservationResult> {
    const response = yield* until(() =>
      this.#fetch(endpoint, {
        body: JSON.stringify({
          ...observation,
          ...attribution,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    if (!response.ok) {
      throw new Error(`Workspace Service 拒绝岗位观察：HTTP ${String(response.status)}`);
    }
    return SaveJobObservationResultContract.assert(yield* until(() => response.json()));
  }
}
