import type { BrowserRuntimeStatus, BrowserSessionPresence } from "@job-boardwalk/contracts";

const defaultLeaseMilliseconds = 15_000;

interface ReceivedStatusReport {
  browserStatus: BrowserRuntimeStatus;
  leaseExpiresAt: number;
  receivedAt: number;
}

export class BrowserSessionPresenceTracker {
  readonly #leaseMilliseconds: number;
  readonly #now: () => number;
  #latestReport: ReceivedStatusReport | null = null;

  public constructor(
    now: () => number = Date.now,
    leaseMilliseconds: number = defaultLeaseMilliseconds,
  ) {
    this.#leaseMilliseconds = leaseMilliseconds;
    this.#now = now;
  }

  public get presence(): BrowserSessionPresence {
    if (!this.#latestReport) {
      return { state: "unknown" };
    }
    if (this.#latestReport.leaseExpiresAt <= this.#now()) {
      return {
        lastBrowserStatus: this.#latestReport.browserStatus,
        lastReceivedAt: new Date(this.#latestReport.receivedAt).toISOString(),
        state: "offline",
      };
    }
    return {
      browserStatus: this.#latestReport.browserStatus,
      leaseExpiresAt: new Date(this.#latestReport.leaseExpiresAt).toISOString(),
      receivedAt: new Date(this.#latestReport.receivedAt).toISOString(),
      state: "online",
    };
  }

  public receive(browserStatus: BrowserRuntimeStatus): BrowserSessionPresence {
    const receivedAt = this.#now();
    this.#latestReport = {
      browserStatus,
      leaseExpiresAt: receivedAt + this.#leaseMilliseconds,
      receivedAt,
    };
    return this.presence;
  }
}
