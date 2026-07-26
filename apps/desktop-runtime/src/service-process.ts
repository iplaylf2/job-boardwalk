import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import type { DesktopProductLayout } from "@job-boardwalk/desktop-product-layout";
import { sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { race } from "@shajara/host/primitives";
import type { SystemBrowserDiscovery } from "#/system-browser-discovery.js";

const readinessRetryMilliseconds = 100;
const standardErrorFileDescriptor = 2;

interface ServiceExit {
  readonly code: number | null;
  readonly role: DesktopServiceRole;
  readonly signal: NodeJS.Signals | null;
}

export type DesktopServiceRole = "browser-session" | "dashboard-host" | "workspace-service";

export interface ServiceProcess {
  readonly child: ChildProcess;
  readonly exit: Promise<ServiceExit>;
  readonly role: DesktopServiceRole;
}

type ServiceStartupResult =
  | { readonly kind: "ready"; readonly serviceProcess: ServiceProcess }
  | { readonly kind: "shutdown"; readonly serviceProcess: ServiceProcess };

function serviceArguments(
  layout: DesktopProductLayout,
  role: DesktopServiceRole,
  systemBrowser: SystemBrowserDiscovery,
): string[] {
  if (role !== "browser-session" || systemBrowser.state !== "recognized") {
    return [`--role=${role}`];
  }
  return [
    `--role=${role}`,
    `--browser-executable-path=${systemBrowser.executablePath}`,
    `--browser-profile-path=${layout.browserProfileDirectory}`,
  ];
}

function spawnServiceProcess(
  layout: DesktopProductLayout,
  role: DesktopServiceRole,
  systemBrowser: SystemBrowserDiscovery,
): ServiceProcess {
  const child = spawn(layout.runtimeExecutable, serviceArguments(layout, role, systemBrowser), {
    stdio: ["ignore", standardErrorFileDescriptor, standardErrorFileDescriptor],
    windowsHide: true,
  });
  return {
    child,
    exit: waitForExit(child, role),
    role,
  };
}

function waitForExit(child: ChildProcess, role: DesktopServiceRole): Promise<ServiceExit> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({
      code: child.exitCode,
      role,
      signal: child.signalCode,
    });
  }
  return new Promise<ServiceExit>((resolve, reject) => {
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

export function* startServiceAndAwaitReadiness(
  options: {
    readonly systemBrowser: SystemBrowserDiscovery;
    readonly healthUrl: string;
    readonly layout: DesktopProductLayout;
    readonly role: DesktopServiceRole;
  },
  awaitShutdown: () => RiteCoroutine<void>,
): RiteCoroutine<ServiceStartupResult> {
  const serviceProcess = spawnServiceProcess(options.layout, options.role, options.systemBrowser);
  const result = yield* race([
    function* awaitReadiness(): RiteCoroutine<{ readonly kind: "ready" }> {
      yield* waitForReadiness(options.healthUrl);
      return { kind: "ready" };
    },
    function* awaitPrematureExit(): RiteCoroutine<ServiceExit> {
      return yield* until(() => serviceProcess.exit);
    },
    function* awaitStartupShutdown(): RiteCoroutine<{ readonly kind: "shutdown" }> {
      yield* awaitShutdown();
      return { kind: "shutdown" };
    },
  ]);
  if ("kind" in result) {
    return { kind: result.kind, serviceProcess };
  }
  throw new Error(
    `${result.role} exited before readiness (${result.signal ?? `exit ${result.code ?? "unknown"}`})`,
  );
}

export function* stopService(serviceProcess: ServiceProcess): RiteCoroutine<void> {
  if (serviceProcess.child.exitCode !== null || serviceProcess.child.signalCode !== null) {
    return;
  }
  serviceProcess.child.kill();
  yield* until(() => serviceProcess.exit);
}

export function* waitForShutdownOrServiceExit(
  serviceProcesses: readonly ServiceProcess[],
  waitForShutdown: () => RiteCoroutine<void>,
): RiteCoroutine<void> {
  const outcome = yield* race([
    function* awaitRequestedShutdown(): RiteCoroutine<{ readonly shutdown: true }> {
      yield* waitForShutdown();
      return { shutdown: true };
    },
    ...serviceProcesses.map(
      (serviceProcess) =>
        function* awaitServiceExit(): RiteCoroutine<ServiceExit> {
          return yield* until(() => serviceProcess.exit);
        },
    ),
  ]);
  if (!("shutdown" in outcome)) {
    throw new Error(
      `${outcome.role} exited unexpectedly (${outcome.signal ?? `exit ${outcome.code ?? "unknown"}`})`,
    );
  }
}
