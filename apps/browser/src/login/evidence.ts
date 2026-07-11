import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";

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

function assertObservationActive(session: BrowserSession, deadline: number): void {
  if (hasBrowserProcessExited(session.browserProcess)) {
    throw new Error("登录完成前浏览器已退出");
  }
  if (Date.now() >= deadline) {
    throw new Error("等待登录超时");
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

async function waitForProfileCookieEvidence(
  session: BrowserSession,
  evidence: Extract<AuthenticationEvidence, { kind: "profile-cookie-names" }>,
  deadline: number,
): Promise<void> {
  assertObservationActive(session, deadline);
  try {
    const cookieNames = readProfileCookieNames(session.profilePath, evidence.cookieDomain);
    if (includesAllRequiredCookieNames(cookieNames, evidence.requiredCookieNames)) {
      return;
    }
  } catch {
    // Chromium may briefly lock or replace the database while committing state.
  }
  await setTimeout(authenticationPollingMilliseconds);
  return waitForProfileCookieEvidence(session, evidence, deadline);
}

async function connectCdpCookieEvidence(
  session: BrowserSession,
  evidence: Extract<AuthenticationEvidence, { kind: "cdp-cookie-names" }>,
  deadline: number,
): Promise<void> {
  assertObservationActive(session, deadline);
  if (session.debuggingPort === undefined) {
    throw new Error("CDP Cookie 名称观察器需要浏览器控制端口");
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${session.debuggingPort}`);
  const [context] = browser.contexts();
  if (context === undefined) {
    throw new Error("Chromium 未提供可观察的浏览上下文");
  }
  return waitForCdpCookieEvidence(session, context, evidence, deadline);
}

async function waitForCdpCookieEvidence(
  session: BrowserSession,
  context: BrowserContext,
  evidence: Extract<AuthenticationEvidence, { kind: "cdp-cookie-names" }>,
  deadline: number,
): Promise<void> {
  assertObservationActive(session, deadline);
  const cookies = await context.cookies(evidence.cookieUrl);
  const cookieNames = new Set(cookies.map(({ name }) => name));
  if (includesAllRequiredCookieNames(cookieNames, evidence.requiredCookieNames)) {
    return;
  }
  await setTimeout(authenticationPollingMilliseconds);
  return waitForCdpCookieEvidence(session, context, evidence, deadline);
}

export function waitForAuthenticationEvidence(
  session: BrowserSession,
  evidence: AuthenticationEvidence,
): Promise<void> {
  const deadline = Date.now() + loginTimeoutMilliseconds;
  return evidence.kind === "profile-cookie-names"
    ? waitForProfileCookieEvidence(session, evidence, deadline)
    : connectCdpCookieEvidence(session, evidence, deadline);
}
