import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import process from "node:process";

import type { DesktopProductLayout } from "@job-boardwalk/desktop-product-layout";
import { completer, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";

const readinessRetryMilliseconds = 100;

interface RoleExit {
  readonly code: number | null;
  readonly role: SupervisedRole;
  readonly signal: NodeJS.Signals | null;
}

type SupervisedRole = "dashboard-host" | "workspace-service";

interface RuntimeRoleProcess {
  readonly child: ChildProcess;
  readonly exit: Promise<RoleExit>;
  readonly role: SupervisedRole;
}

type StartupResult =
  | { readonly kind: "ready"; readonly roleProcess: RuntimeRoleProcess }
  | { readonly kind: "shutdown"; readonly roleProcess: RuntimeRoleProcess };

function spawnRoleProcess(layout: DesktopProductLayout, role: SupervisedRole): RuntimeRoleProcess {
  const child = spawn(layout.runtimeExecutable, [`--role=${role}`], {
    stdio: "inherit",
    windowsHide: true,
  });
  return {
    child,
    exit: waitForExit(child, role),
    role,
  };
}

function waitForExit(child: ChildProcess, role: SupervisedRole): Promise<RoleExit> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({
      code: child.exitCode,
      role,
      signal: child.signalCode,
    });
  }
  return new Promise<RoleExit>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, role, signal }));
  });
}

function* waitForReadiness(url: string): RiteCoroutine<void> {
  while (true) {
    try {
      const response = yield* until(() => fetch(url));
      if (response.ok) {
        return;
      }
    } catch {
      // The supervised service may still be binding its listener.
    }
    yield* sleep(readinessRetryMilliseconds);
  }
}

function* startAndAwaitReadiness(
  layout: DesktopProductLayout,
  role: SupervisedRole,
  healthUrl: string,
  awaitShutdown: () => RiteCoroutine<void>,
): RiteCoroutine<StartupResult> {
  const roleProcess = spawnRoleProcess(layout, role);
  const result = yield* race([
    function* awaitReadiness(): RiteCoroutine<{ readonly kind: "ready" }> {
      yield* waitForReadiness(healthUrl);
      return { kind: "ready" };
    },
    function* awaitPrematureExit(): RiteCoroutine<RoleExit> {
      return yield* until(() => roleProcess.exit);
    },
    function* awaitStartupShutdown(): RiteCoroutine<{ readonly kind: "shutdown" }> {
      yield* awaitShutdown();
      return { kind: "shutdown" };
    },
  ]);
  if ("kind" in result) {
    return { kind: result.kind, roleProcess };
  }
  throw new Error(
    `${result.role} exited before readiness (${result.signal ?? `exit ${result.code ?? "unknown"}`})`,
  );
}

function* stopRole(roleProcess: RuntimeRoleProcess): RiteCoroutine<void> {
  if (roleProcess.child.exitCode !== null || roleProcess.child.signalCode !== null) {
    return;
  }
  roleProcess.child.kill();
  yield* until(() => roleProcess.exit);
}

function installShutdownHandlers(requestShutdown: () => void): () => void {
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  return () => {
    process.removeListener("SIGINT", requestShutdown);
    process.removeListener("SIGTERM", requestShutdown);
  };
}

function* waitForShutdownOrRoleExit(
  workspaceService: RuntimeRoleProcess,
  dashboardHost: RuntimeRoleProcess,
  waitForShutdown: () => RiteCoroutine<void>,
): RiteCoroutine<void> {
  const outcome = yield* race([
    function* awaitRequestedShutdown(): RiteCoroutine<{ readonly shutdown: true }> {
      yield* waitForShutdown();
      return { shutdown: true };
    },
    function* awaitDashboardExit(): RiteCoroutine<RoleExit> {
      return yield* until(() => dashboardHost.exit);
    },
    function* awaitWorkspaceExit(): RiteCoroutine<RoleExit> {
      return yield* until(() => workspaceService.exit);
    },
  ]);
  if (!("shutdown" in outcome)) {
    throw new Error(
      `${outcome.role} exited unexpectedly (${outcome.signal ?? `exit ${outcome.code ?? "unknown"}`})`,
    );
  }
}

function* superviseRoles(
  layout: DesktopProductLayout,
  waitForShutdown: () => RiteCoroutine<void>,
): RiteCoroutine<void> {
  let workspaceService: RuntimeRoleProcess | null = null;
  let dashboardHost: RuntimeRoleProcess | null = null;
  try {
    const workspaceStartup = yield* startAndAwaitReadiness(
      layout,
      "workspace-service",
      "http://127.0.0.1:54310/health",
      waitForShutdown,
    );
    workspaceService = workspaceStartup.roleProcess;
    if (workspaceStartup.kind === "shutdown") {
      return;
    }
    const dashboardStartup = yield* startAndAwaitReadiness(
      layout,
      "dashboard-host",
      "http://127.0.0.1:54311/health",
      waitForShutdown,
    );
    dashboardHost = dashboardStartup.roleProcess;
    if (dashboardStartup.kind === "shutdown") {
      return;
    }
    yield* waitForShutdownOrRoleExit(workspaceService, dashboardHost, waitForShutdown);
  } finally {
    if (dashboardHost) {
      yield* stopRole(dashboardHost);
    }
    if (workspaceService) {
      yield* stopRole(workspaceService);
    }
  }
}

export function* runApplicationSupervisor(layout: DesktopProductLayout): RiteCoroutine<void> {
  const shutdown = yield* completer<true>();
  function* waitForSupervisorShutdown(): RiteCoroutine<void> {
    yield* wait(shutdown.future);
  }
  const removeShutdownHandlers = installShutdownHandlers(() => shutdown.resolve(true));
  try {
    yield* superviseRoles(layout, waitForSupervisorShutdown);
  } finally {
    removeShutdownHandlers();
  }
}
