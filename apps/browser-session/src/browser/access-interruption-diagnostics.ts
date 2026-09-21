import type { Response } from "patchright";
import type { PlatformAccessObservation } from "@job-boardwalk/contracts";

import { findRecruitingPlatformAdapter } from "./recruiting-platform-adapters.js";

const responseLimit = 128;
const retentionMilliseconds = 120_000;
const diagnosticResourceTypes = new Set(["document", "fetch", "xhr"]);

interface ResponseMetadata {
  readonly observedAt: string;
  readonly platformId: PlatformAccessObservation["platformId"];
  readonly url: string;
  readonly resourceType: string;
  readonly status: number;
  readonly mimeType: string | null;
  readonly hasPunishTypeHeader: boolean;
}

export interface AccessInterruptionReport {
  readonly event: "browser-access-interruption";
  readonly observedAt: string;
  readonly platformId: PlatformAccessObservation["platformId"];
  readonly url: string;
  readonly interruption: string;
  readonly responses: readonly ResponseMetadata[];
}

function urlOriginAndPath(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

/** Passive metadata only: no response bodies, request headers, or browser evaluation. */
export class AccessInterruptionDiagnostics {
  #responses: ResponseMetadata[] = [];

  public constructor(private readonly now: () => number = Date.now) {}

  public recordResponse(response: Response): void {
    const resourceType = response.request().resourceType();
    const adapter = findRecruitingPlatformAdapter(response.url());
    if (!adapter || !diagnosticResourceTypes.has(resourceType)) {
      return;
    }
    const headers = response.headers();
    const [rawMimeType = ""] = (headers["content-type"] ?? "").split(";");
    const mimeType = rawMimeType.trim();
    const capturedAt = this.now();
    this.#responses = [
      ...this.#responses.filter(
        ({ observedAt }) => capturedAt - Date.parse(observedAt) <= retentionMilliseconds,
      ),
      {
        hasPunishTypeHeader: Object.hasOwn(headers, "punish-type"),
        mimeType: mimeType || null,
        observedAt: new Date(capturedAt).toISOString(),
        platformId: adapter.platformId,
        resourceType,
        status: response.status(),
        url: urlOriginAndPath(response.url()),
      },
    ].slice(-responseLimit);
  }

  public createReport(
    observation: Extract<PlatformAccessObservation, { interruption: string }>,
  ): AccessInterruptionReport {
    const capturedAt = this.now();
    return {
      event: "browser-access-interruption",
      interruption: observation.interruption,
      observedAt: observation.observedAt,
      platformId: observation.platformId,
      responses: this.#responses.filter(
        ({ observedAt, platformId }) =>
          platformId === observation.platformId &&
          capturedAt - Date.parse(observedAt) <= retentionMilliseconds,
      ),
      url: urlOriginAndPath(observation.url),
    };
  }
}
