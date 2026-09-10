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
    tabCount: nonNegativeInteger,
  },
);
export type BrowserRuntimeStatus = typeof BrowserRuntimeStatus.infer;

export const BrowserSessionHealth = contract({ browser: BrowserRuntimeStatus, status: "'ok'" });
export type BrowserSessionHealth = typeof BrowserSessionHealth.infer;
