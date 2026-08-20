import type { Page } from "patchright";
import type { PlatformAccessObservation } from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { PageAccessFacts, RecruitingPlatformAdapter } from "./recruiting-platform-adapters.js";
import { capturePageSnapshot } from "./page-snapshot.js";

const firstObservation = 0;
const loginHandoffMaximumObservations = 6;
const loginHandoffObservationIntervalMilliseconds = 500;
const loginHandoffSnapshotTextCharacters = 4000;
const nextObservation = 1;
const userControlRoles = new Set(["button", "checkbox", "combobox", "radio", "textbox"]);

export type LoginPreparationOutcome = "already-authenticated" | "handoff-ready";

export interface ObservedLoginHandoff {
  readonly outcome: LoginPreparationOutcome;
  readonly title: string;
  readonly url: string;
}

export type CurrentAuthenticationObservation =
  | {
      readonly authentication: ObservedLoginHandoff | null;
      readonly outcome: "observed";
    }
  | { readonly outcome: "unreadable" };

type LoginObservationSnapshot = PageAccessFacts & { readonly title: string };
type CurrentAuthenticationSnapshot =
  | { readonly outcome: "observed"; readonly snapshot: LoginObservationSnapshot }
  | { readonly outcome: "unreadable" };
export type ObservePageAccess = (page: PageAccessFacts) => PlatformAccessObservation | null;

function observeAuthentication(
  adapter: RecruitingPlatformAdapter,
  snapshot: LoginObservationSnapshot,
  observePageAccess: ObservePageAccess,
): ObservedLoginHandoff | null {
  const observation = observePageAccess(snapshot);
  return observation?.platformId === adapter.platformId &&
    "authenticationState" in observation &&
    observation.authenticationState === "authenticated"
    ? {
        outcome: "already-authenticated",
        title: snapshot.title,
        url: snapshot.url,
      }
    : null;
}

function hasEnabledUserControl(snapshot: LoginObservationSnapshot): boolean {
  return snapshot.elements.some(
    (element) =>
      element.disabled !== true &&
      typeof element.role === "string" &&
      userControlRoles.has(element.role),
  );
}

export function* observeCurrentAuthentication(
  page: Page,
  adapter: RecruitingPlatformAdapter,
  observePageAccess: ObservePageAccess,
): RiteCoroutine<CurrentAuthenticationObservation> {
  const captured = yield* tryCaptureCurrentAuthenticationSnapshot(page);
  if (captured.outcome === "unreadable") {
    return captured;
  }
  return {
    authentication: observeAuthentication(adapter, captured.snapshot, observePageAccess),
    outcome: "observed",
  };
}

function* tryCaptureCurrentAuthenticationSnapshot(
  page: Page,
): RiteCoroutine<CurrentAuthenticationSnapshot> {
  try {
    return {
      outcome: "observed",
      snapshot: yield* capturePageSnapshot(page, loginHandoffSnapshotTextCharacters),
    };
  } catch (error) {
    if (error instanceof CanceledError || error instanceof ScopeError) {
      throw error;
    }
    return { outcome: "unreadable" };
  }
}

export function* observeLoginHandoff(
  page: Page,
  adapter: RecruitingPlatformAdapter,
  observePageAccess: ObservePageAccess,
): RiteCoroutine<ObservedLoginHandoff> {
  let finalUrl = page.url();
  for (
    let observation = firstObservation;
    observation < loginHandoffMaximumObservations;
    observation += nextObservation
  ) {
    if (page.isClosed()) {
      throw new Error(`${adapter.label}登录交接尚未就绪：标签页已经关闭。`);
    }
    const snapshot = yield* capturePageSnapshot(page, loginHandoffSnapshotTextCharacters);
    finalUrl = snapshot.url;
    const authenticated = observeAuthentication(adapter, snapshot, observePageAccess);
    if (authenticated) {
      return authenticated;
    }
    if (adapter.isLoginPage(snapshot.url) && hasEnabledUserControl(snapshot)) {
      return {
        outcome: "handoff-ready",
        title: snapshot.title,
        url: snapshot.url,
      };
    }
    if (observation + nextObservation < loginHandoffMaximumObservations) {
      yield* sleep(loginHandoffObservationIntervalMilliseconds);
    }
  }
  throw new Error(
    `${adapter.label}登录交接尚未就绪；当前页面为 ${describePageLocation(finalUrl)}。`,
  );
}

function describePageLocation(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "未知页面";
  }
}
