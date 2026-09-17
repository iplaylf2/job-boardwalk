import { PlatformAccessObservation } from "./platform-access.ts";
import { contract } from "./internal/contract.ts";
import {
  nonNegativeInteger,
  normalizedTimestamp,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

export const BrowserRuntimeStatus = contract.or(
  {
    available: "false",
    lifecycle: {
      "lastFailure?": {
        category: "'launch-failed' | 'window-closed' | 'runtime-failed'",
        occurredAt: normalizedTimestamp,
      },
      "nextAttemptAt?": normalizedTimestamp,
      phase: "'starting' | 'closing' | 'retry-wait' | 'stopped'",
      phaseStartedAt: normalizedTimestamp,
    },
  },
  {
    available: "true",
    "browserVersion?": trimmedNonEmptyString,
    control: {
      interruption: PlatformAccessObservation.or("null"),
      matchingTabIds: nonNegativeInteger.array(),
      state: "'active' | 'preparing-handoff' | 'quiescing' | 'user-handoff'",
    },
    tabCount: nonNegativeInteger,
  },
);
export type BrowserRuntimeStatus = typeof BrowserRuntimeStatus.infer;

export const BrowserSessionHealth = contract({ browser: BrowserRuntimeStatus, status: "'ok'" });
export type BrowserSessionHealth = typeof BrowserSessionHealth.infer;
