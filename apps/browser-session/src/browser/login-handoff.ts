import type { Page } from "patchright";
import type { PlatformAccessObservation } from "@job-boardwalk/contracts";
import { CanceledError, ScopeError, sleep } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import type { PageAccessFacts, RecruitingPlatformAdapter } from "#/browser/platforms/types.js";
import { capturePageSnapshot } from "./page-snapshot.js";

const firstObservation = 0;
const firstPage = 0;
const loginHandoffMaximumObservations = 6;
const loginHandoffObservationIntervalMilliseconds = 500;
const loginHandoffSnapshotTextCharacters = 4000;
const noPages = 0;
const nextObservation = 1;
const userControlRoles = new Set(["button", "checkbox", "combobox", "radio", "textbox"]);

export type LoginPreparationOutcome = "already-authenticated" | "handoff-ready";

interface ObservedLoginHandoff {
  readonly outcome: LoginPreparationOutcome;
  readonly title: string;
  readonly url: string;
}

type ExistingPageLoginDisposition =
  | {
      readonly authentication: ObservedLoginHandoff;
      readonly outcome: "already-authenticated";
    }
  | {
      readonly handoff: ObservedLoginHandoff;
      readonly outcome: "handoff-ready";
    }
  | { readonly outcome: "login-page" }
  | { readonly outcome: "preserve" };

interface ObservedLoginHandoffPage {
  readonly handoff: ObservedLoginHandoff;
  readonly page: Page;
}

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

function* classifyExistingPageForLogin(
  page: Page,
  adapter: RecruitingPlatformAdapter,
  observePageAccess: ObservePageAccess,
): RiteCoroutine<ExistingPageLoginDisposition> {
  const captured = yield* tryCaptureCurrentAuthenticationSnapshot(page);
  if (captured.outcome === "unreadable") {
    return { outcome: "preserve" };
  }
  const authentication = observeAuthentication(adapter, captured.snapshot, observePageAccess);
  if (authentication) {
    return { authentication, outcome: "already-authenticated" };
  }
  if (!adapter.isLoginPage(captured.snapshot.url)) {
    return { outcome: "preserve" };
  }
  return hasEnabledUserControl(captured.snapshot)
    ? {
        handoff: {
          outcome: "handoff-ready",
          title: captured.snapshot.title,
          url: captured.snapshot.url,
        },
        outcome: "handoff-ready",
      }
    : { outcome: "login-page" };
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

type LoginCandidateObservation =
  | { readonly outcome: "preserve" }
  | { readonly outcome: "retry" }
  | ({ readonly outcome: "ready" } & ObservedLoginHandoffPage);

function* observeLoginCandidate(
  page: Page,
  adapter: RecruitingPlatformAdapter,
  observePageAccess: ObservePageAccess,
): RiteCoroutine<LoginCandidateObservation> {
  if (page.isClosed()) {
    return { outcome: "preserve" };
  }
  const captured = yield* tryCaptureCurrentAuthenticationSnapshot(page);
  if (captured.outcome === "unreadable") {
    return { outcome: "retry" };
  }
  const { snapshot } = captured;
  const authenticated = observeAuthentication(adapter, snapshot, observePageAccess);
  if (authenticated) {
    return { handoff: authenticated, outcome: "ready", page };
  }
  if (!adapter.isLoginPage(snapshot.url) || !adapter.isLoginPage(page.url())) {
    return { outcome: "preserve" };
  }
  return hasEnabledUserControl(snapshot)
    ? {
        handoff: {
          outcome: "handoff-ready",
          title: snapshot.title,
          url: snapshot.url,
        },
        outcome: "ready",
        page,
      }
    : { outcome: "retry" };
}

function* observeLoginHandoffCandidates(
  pages: readonly Page[],
  adapter: RecruitingPlatformAdapter,
  observePageAccess: ObservePageAccess,
): RiteCoroutine<ObservedLoginHandoffPage> {
  let finalUrl = pages[firstPage]?.url() ?? adapter.loginUrl;
  const candidates = new Set(pages);
  for (
    let observation = firstObservation;
    observation < loginHandoffMaximumObservations;
    observation += nextObservation
  ) {
    for (const page of candidates) {
      const candidate = yield* observeLoginCandidate(page, adapter, observePageAccess);
      if (candidate.outcome === "preserve") {
        candidates.delete(page);
        continue;
      }
      if (candidate.outcome === "ready") {
        return candidate;
      }
      finalUrl = page.url();
    }
    if (
      candidates.size > noPages &&
      observation + nextObservation < loginHandoffMaximumObservations
    ) {
      yield* sleep(loginHandoffObservationIntervalMilliseconds);
    }
  }
  throw new Error(
    `${adapter.label}登录交接尚未就绪：无法确认已登录状态或可用登录界面；最后已知页面为 ${describePageLocation(finalUrl)}。`,
  );
}

export function* observeLoginHandoffPage(
  page: Page,
  adapter: RecruitingPlatformAdapter,
  observePageAccess: ObservePageAccess,
): RiteCoroutine<ObservedLoginHandoff> {
  const observed = yield* observeLoginHandoffCandidates([page], adapter, observePageAccess);
  return observed.handoff;
}

export function* prepareExistingLoginHandoff(
  pages: readonly Page[],
  adapter: RecruitingPlatformAdapter,
  observePageAccess: ObservePageAccess,
): RiteCoroutine<ObservedLoginHandoffPage | null> {
  const candidates: Page[] = [];
  const ready: ObservedLoginHandoffPage[] = [];
  for (const page of pages) {
    const disposition = yield* classifyExistingPageForLogin(page, adapter, observePageAccess);
    if (disposition.outcome === "already-authenticated") {
      return { handoff: disposition.authentication, page };
    }
    if (disposition.outcome === "handoff-ready") {
      ready.push({ handoff: disposition.handoff, page });
    }
    if (disposition.outcome === "login-page") {
      candidates.push(page);
    }
  }
  const readyPage = ready.find(({ page }) => !page.isClosed() && adapter.isLoginPage(page.url()));
  if (readyPage) {
    return readyPage;
  }
  const currentCandidates = candidates.filter(
    (page) => !page.isClosed() && adapter.isLoginPage(page.url()),
  );
  return currentCandidates.length === noPages
    ? null
    : yield* observeLoginHandoffCandidates(currentCandidates, adapter, observePageAccess);
}

function describePageLocation(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "未知页面";
  }
}
