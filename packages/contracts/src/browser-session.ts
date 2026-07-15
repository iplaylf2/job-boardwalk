import type { PlatformAccessObservation } from "./platform-access.ts";

export type BrowserRuntimeStatus =
  | {
      available: false;
      lastError?: string;
    }
  | {
      available: true;
      browserVersion?: string;
      tabCount: number;
    };

export interface BrowserSessionStatusReport {
  browserStatus: BrowserRuntimeStatus;
  platformAccessObservations: PlatformAccessObservation[];
}

export type BrowserSessionPresence =
  | {
      state: "unknown";
    }
  | {
      browserStatus: BrowserRuntimeStatus;
      leaseExpiresAt: string;
      receivedAt: string;
      state: "online";
    }
  | {
      lastBrowserStatus: BrowserRuntimeStatus;
      lastReceivedAt: string;
      state: "offline";
    };
