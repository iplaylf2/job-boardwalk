import { DatabaseSync } from "node:sqlite";

import { CanceledError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race } from "@shajara/host/primitives";
import { chromium } from "playwright";
import type { BrowserContext } from "playwright";

import { hasBrowserProcessExited } from "#/browser/session.js";
import type { BrowserSession } from "#/browser/session.js";

export type AuthenticationEvidence =
  | {
      cookieUrl: string;
      kind: "cdp-cookie-names";
      requiredCookieNames: readonly [string, ...string[]];
    }
  | {
      cookieDomain: string;
      kind: "profile-cookie-names";
      requiredCookieNames: readonly [string, ...string[]];
    };

const loginTimeoutMinutes = 10;
const secondsPerMinute = 60;
const millisecondsPerSecond = 1000;
const authenticationPollingMilliseconds = 500;
const loginTimeoutMilliseconds = loginTimeoutMinutes * secondsPerMinute * millisecondsPerSecond;

function assertBrowserActive(session: BrowserSession): void {
  if (hasBrowserProcessExited(session.browserProcess)) {
    throw new Error("登录完成前浏览器已退出");
  }
}

function includesAllRequiredCookieNames(
  cookieNames: ReadonlySet<string>,
  requiredCookieNames: readonly string[],
): boolean {
  return requiredCookieNames.every((name) => cookieNames.has(name));
}

function readProfileCookieNames(profilePath: string, domain: string): Set<string> {
  const database = new DatabaseSync(`${profilePath}/Default/Cookies`, { readOnly: true });
  try {
    const rows = database
      .prepare("select distinct name from cookies where host_key = ? or host_key like ?")
      .all(domain, `%.${domain}`) as { name: string }[];
    return new Set(rows.map(({ name }) => name));
  } finally {
    database.close();
  }
}

function* waitForProfileCookieEvidence(
  session: BrowserSession,
  evidence: Extract<AuthenticationEvidence, { kind: "profile-cookie-names" }>,
): RiteCoroutine<void> {
  while (true) {
    assertBrowserActive(session);
    try {
      const cookieNames = readProfileCookieNames(session.profilePath, evidence.cookieDomain);
      if (includesAllRequiredCookieNames(cookieNames, evidence.requiredCookieNames)) {
        return;
      }
    } catch {
      // Chromium may briefly lock or replace the database while committing state.
    }
    yield* sleep(authenticationPollingMilliseconds);
  }
}

function* connectCdpCookieEvidence(
  session: BrowserSession,
  evidence: Extract<AuthenticationEvidence, { kind: "cdp-cookie-names" }>,
): RiteCoroutine<void> {
  assertBrowserActive(session);
  if (session.debuggingPort === undefined) {
    throw new Error("CDP Cookie 名称观察器需要浏览器控制端口");
  }
  const browser = yield* until(() =>
    chromium.connectOverCDP(`http://127.0.0.1:${session.debuggingPort}`),
  );
  const [context] = browser.contexts();
  if (context === undefined) {
    throw new Error("Chromium 未提供可观察的浏览上下文");
  }
  return yield* waitForCdpCookieEvidence(session, context, evidence);
}

function* waitForCdpCookieEvidence(
  session: BrowserSession,
  context: BrowserContext,
  evidence: Extract<AuthenticationEvidence, { kind: "cdp-cookie-names" }>,
): RiteCoroutine<void> {
  while (true) {
    assertBrowserActive(session);
    const cookies = yield* until(() => context.cookies(evidence.cookieUrl));
    const cookieNames = new Set(cookies.map(({ name }) => name));
    if (includesAllRequiredCookieNames(cookieNames, evidence.requiredCookieNames)) {
      return;
    }
    yield* sleep(authenticationPollingMilliseconds);
  }
}

export function* waitForAuthenticationEvidence(
  session: BrowserSession,
  evidence: AuthenticationEvidence,
): RiteCoroutine<void> {
  const outcome = yield* race([
    function* observeAuthentication() {
      try {
        yield* evidence.kind === "profile-cookie-names"
          ? waitForProfileCookieEvidence(session, evidence)
          : connectCdpCookieEvidence(session, evidence);
        return { kind: "authenticated" } as const;
      } catch (error) {
        if (error instanceof CanceledError) {
          throw error;
        }
        return { error, kind: "failed" } as const;
      }
    },
    function* limitAuthenticationWait() {
      yield* sleep(loginTimeoutMilliseconds);
      return { kind: "timeout" } as const;
    },
  ]);
  if (outcome.kind === "failed") {
    throw outcome.error;
  }
  if (outcome.kind === "timeout") {
    throw new Error("等待登录超时");
  }
}
