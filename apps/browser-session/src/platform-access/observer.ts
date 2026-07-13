import process from "node:process";

import type { BrowserContext } from "playwright";
import type {
  PlatformAccessAssessment,
  RecordPlatformAccessObservationInput,
} from "@job-boardwalk/contracts";
import { platformIds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { CanceledError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { all, wait } from "@shajara/host/primitives";

import { platformAccessSignals } from "./signals.js";

const observationIntervalMilliseconds = 1000;

type PlatformAccessDetection = PlatformAccessAssessment & {
  platformId: PlatformId;
};

interface PlatformAccessObservationSink {
  recordPlatformAccessObservation: (
    observation: RecordPlatformAccessObservationInput,
  ) => RiteCoroutine<void>;
}

function pageUrlsByPlatform(context: BrowserContext): Map<PlatformId, URL[]> {
  const urls = new Map<PlatformId, URL[]>();
  for (const page of context.pages()) {
    let pageUrl: URL | null = null;
    try {
      pageUrl = new URL(page.url());
    } catch {
      continue;
    }
    for (const platformId of platformIds) {
      if (platformAccessSignals[platformId].hosts.some((host) => host === pageUrl.hostname)) {
        const platformUrls = urls.get(platformId) ?? [];
        platformUrls.push(pageUrl);
        urls.set(platformId, platformUrls);
      }
    }
  }
  return urls;
}

function* detectPlatformAccess(context: BrowserContext): RiteCoroutine<PlatformAccessDetection[]> {
  const urlsByPlatform = pageUrlsByPlatform(context);
  const cookies = yield* until(() => context.cookies());
  const detected: PlatformAccessDetection[] = [];
  for (const platformId of platformIds) {
    const platformUrls = urlsByPlatform.get(platformId);
    if (!platformUrls) {
      continue;
    }
    const signals = platformAccessSignals[platformId];
    const cookieNames = new Set(
      cookies
        .filter((cookie) => {
          const cookieDomain = cookie.domain.replace(/^\./u, "");
          return signals.hosts.some(
            (host) => host === cookieDomain || host.endsWith(`.${cookieDomain}`),
          );
        })
        .map((cookie) => cookie.name),
    );
    const loginPageVisible = platformUrls.some((pageUrl) =>
      signals.loginPathPrefixes.some((prefix) => pageUrl.pathname.startsWith(prefix)),
    );
    if (loginPageVisible) {
      detected.push({ evidence: "login-page", platformId, state: "login-required" });
      continue;
    }
    if (signals.authenticationCookieNames.every((name) => cookieNames.has(name))) {
      detected.push({
        evidence: "authentication-cookie",
        platformId,
        state: "authentication-unverified",
      });
    }
  }
  return detected;
}

function observationSignature(observation: PlatformAccessDetection): string {
  return `${observation.platformId}:${observation.state}:${observation.evidence}`;
}

function* recordPlatformAccessDetection(
  browserSessionId: string,
  observationSink: PlatformAccessObservationSink,
  detection: PlatformAccessDetection,
): RiteCoroutine<void> {
  yield* observationSink.recordPlatformAccessObservation({
    browserSessionId,
    observedAt: new Date().toISOString(),
    ...detection,
  });
}

export function* observePlatformAccess(
  browserSessionId: string,
  context: BrowserContext,
  observationSink: PlatformAccessObservationSink,
): RiteCoroutine<never> {
  const lastReportedSignatures = new Map<PlatformId, string>();
  const reportedErrors = new Set<string>();
  while (true) {
    try {
      const detected = yield* detectPlatformAccess(context);
      const changed = detected.filter(
        (detection) =>
          lastReportedSignatures.get(detection.platformId) !== observationSignature(detection),
      );
      const reports = yield* all(
        changed.map(
          (detection) =>
            function* reportPlatformAccess() {
              yield* recordPlatformAccessDetection(browserSessionId, observationSink, detection);
              return detection;
            },
        ),
      );
      const reported = yield* wait(reports);
      for (const detection of reported) {
        lastReportedSignatures.set(detection.platformId, observationSignature(detection));
      }
      reportedErrors.clear();
    } catch (error) {
      if (error instanceof CanceledError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (!reportedErrors.has(message)) {
        process.stderr.write(`Browser Session 观察平台访问失败：${message}\n`);
        reportedErrors.add(message);
      }
    }
    yield* sleep(observationIntervalMilliseconds);
  }
}
