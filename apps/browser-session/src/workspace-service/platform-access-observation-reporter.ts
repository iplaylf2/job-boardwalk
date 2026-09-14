import type { PlatformAccessObservation } from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const reportingIntervalMilliseconds = 5000;

type PlatformAccessObservationReader = () => PlatformAccessObservation[];

export class PlatformAccessObservationReporter {
  readonly #fetch: typeof fetch;
  readonly #acknowledge: (observation: PlatformAccessObservation) => void;
  readonly #readPlatformAccessObservations: PlatformAccessObservationReader;
  readonly #observationEndpoint: URL;

  public constructor(
    workspaceServiceUrl: URL,
    readPlatformAccessObservations: PlatformAccessObservationReader,
    acknowledge: (observation: PlatformAccessObservation) => void,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.#acknowledge = acknowledge;
    this.#fetch = fetchImplementation;
    this.#readPlatformAccessObservations = readPlatformAccessObservations;
    this.#observationEndpoint = new URL("/api/platform-access/observations", workspaceServiceUrl);
  }

  public *report(): RiteCoroutine<void> {
    for (const observation of this.#readPlatformAccessObservations()) {
      const body = JSON.stringify(observation);
      const response = yield* until(() =>
        this.#fetch(this.#observationEndpoint, {
          body,
          headers: { "content-type": "application/json" },
          method: "PUT",
        }),
      );
      if (!response.ok) {
        throw new Error(`Workspace Service 拒绝平台访问观察：HTTP ${String(response.status)}`);
      }
      this.#acknowledge(observation);
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
