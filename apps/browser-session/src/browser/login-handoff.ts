import type { Page } from "patchright";
import { sleep } from "@shajara/host";
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

type LoginObservationSnapshot = PageAccessFacts & { readonly title: string };

function observeAuthentication(
  adapter: RecruitingPlatformAdapter,
  snapshot: LoginObservationSnapshot,
): ObservedLoginHandoff | null {
  const assessment = adapter.assessPage?.(snapshot);
  return assessment &&
    "authenticationState" in assessment &&
    assessment.authenticationState === "authenticated"
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
): RiteCoroutine<ObservedLoginHandoff | null> {
  const snapshot = yield* capturePageSnapshot(page, loginHandoffSnapshotTextCharacters);
  return observeAuthentication(adapter, snapshot);
}

export function* observeLoginHandoff(
  page: Page,
  adapter: RecruitingPlatformAdapter,
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
    const authenticated = observeAuthentication(adapter, snapshot);
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
