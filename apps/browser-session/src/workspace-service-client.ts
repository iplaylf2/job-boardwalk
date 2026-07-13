import process from "node:process";

import type { RecordPlatformAccessObservationInput } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const defaultWorkspaceServiceUrl = "http://127.0.0.1:54310";

function resolveWorkspaceServiceUrl(): string {
  const configuredUrl = process.env["JOB_BOARDWALK_WORKSPACE_SERVICE_URL"]?.trim();
  return (configuredUrl || defaultWorkspaceServiceUrl).replace(/\/$/u, "");
}

export class WorkspaceServiceClient {
  readonly #serviceUrl = resolveWorkspaceServiceUrl();

  public *recordPlatformAccessObservation(
    observation: RecordPlatformAccessObservationInput,
  ): RiteCoroutine<void> {
    const response = yield* until(() =>
      fetch(`${this.#serviceUrl}/api/platform-access/observations`, {
        body: JSON.stringify(observation),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    if (!response.ok) {
      const message = yield* until(() => response.text());
      throw new Error(
        `Workspace Service 未能保存平台访问观察（HTTP ${response.status}）：${message}`,
      );
    }
  }
}
