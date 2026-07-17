import { contract } from "./internal/contract.ts";
import {
  nonNegativeInteger,
  normalizedTimestamp,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";
import { PlatformAccessObservation } from "./platform-access.ts";

const unavailableBrowserRuntimeStatus = contract({
  available: "false",
  "lastError?": trimmedNonEmptyString,
});

const availableBrowserRuntimeStatus = contract({
  available: "true",
  "browserVersion?": trimmedNonEmptyString,
  tabCount: nonNegativeInteger,
});

export const BrowserRuntimeStatus = contract.or(
  unavailableBrowserRuntimeStatus,
  availableBrowserRuntimeStatus,
);
export type BrowserRuntimeStatus = typeof BrowserRuntimeStatus.infer;

export const BrowserSessionStatusReport = contract({
  browserStatus: BrowserRuntimeStatus,
  platformAccessObservations: PlatformAccessObservation.array(),
});
export type BrowserSessionStatusReport = typeof BrowserSessionStatusReport.infer;

export const BrowserSessionPresence = contract.or(
  {
    state: "'unknown'",
  },
  {
    browserStatus: BrowserRuntimeStatus,
    leaseExpiresAt: normalizedTimestamp,
    receivedAt: normalizedTimestamp,
    state: "'online'",
  },
  {
    lastBrowserStatus: BrowserRuntimeStatus,
    lastReceivedAt: normalizedTimestamp,
    state: "'offline'",
  },
);
export type BrowserSessionPresence = typeof BrowserSessionPresence.infer;
