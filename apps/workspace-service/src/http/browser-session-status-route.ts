import type { Hono } from "hono";
import { BrowserSessionStatusReport } from "@job-boardwalk/contracts";
import type { Scope } from "@shajara/host";

import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { readRequestBody, requestErrorResponse } from "./request.js";

const successfulStatus = 200;

export function registerBrowserSessionStatusRoute(
  app: Hono,
  presenceTracker: BrowserSessionPresenceTracker,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.put("/api/browser-session/status", (context) =>
    serviceScope.run(function* updateBrowserSessionStatus() {
      try {
        const report = yield* readRequestBody(context, BrowserSessionStatusReport);
        for (const observation of report.platformAccessObservations) {
          repository.recordPlatformAccessObservationIfChanged(observation);
        }
        const presence = presenceTracker.receive(report.browserStatus);
        return context.json(presence, successfulStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
