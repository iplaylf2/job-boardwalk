import type { Hono } from "hono";
import type { BrowserRuntimeStatus, BrowserSessionStatusReport } from "@job-boardwalk/contracts";
import type { Scope } from "@shajara/host";

import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { readPlatformAccessObservation } from "./platform-access-observation-parser.js";

import {
  InvalidRequestError,
  isRecord,
  readJsonObject,
  readRequiredArray,
  readOptionalString,
  readRequiredBoolean,
  requestErrorResponse,
} from "./request.js";

const minimumTabCount = 0;
const successfulStatus = 200;

function readBrowserStatus(input: Record<string, unknown>): BrowserRuntimeStatus {
  const value = input["browserStatus"];
  if (!isRecord(value)) {
    throw new InvalidRequestError("browserStatus 必须是对象");
  }
  const available = readRequiredBoolean(value, "available");
  if (!available) {
    const lastError = readOptionalString(value, "lastError");
    return { available, ...(lastError ? { lastError } : {}) };
  }
  const { tabCount } = value;
  if (!Number.isInteger(tabCount) || typeof tabCount !== "number" || tabCount < minimumTabCount) {
    throw new InvalidRequestError("browserStatus.tabCount 必须是非负整数");
  }
  const browserVersion = readOptionalString(value, "browserVersion");
  return { available, ...(browserVersion ? { browserVersion } : {}), tabCount };
}

function readStatusReport(input: Record<string, unknown>): BrowserSessionStatusReport {
  const platformAccessObservations = readRequiredArray(input, "platformAccessObservations").map(
    (value) => {
      if (!isRecord(value)) {
        throw new InvalidRequestError("platformAccessObservations 的项目必须是对象");
      }
      return readPlatformAccessObservation(value);
    },
  );
  return { browserStatus: readBrowserStatus(input), platformAccessObservations };
}

export function registerBrowserSessionStatusRoute(
  app: Hono,
  presenceTracker: BrowserSessionPresenceTracker,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.put("/api/browser-session/status", (context) =>
    serviceScope.run(function* updateBrowserSessionStatus() {
      try {
        const input = yield* readJsonObject(context);
        const report = readStatusReport(input);
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
