import path from "node:path";
import process from "node:process";

import type { DesktopProductLayout } from "@job-boardwalk/desktop-product-layout";
import { completer, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import {
  RuntimeState,
  SystemBrowserFamily,
  SystemBrowserState,
} from "#/generated/job_boardwalk/desktop_lifecycle/v1/desktop_lifecycle_pb.js";
import { encodeRuntimeStatus, readManagerMessages } from "#/desktop-lifecycle-protocol.js";
import type { RuntimeStatusInput } from "#/desktop-lifecycle-protocol.js";
import {
  startServiceAndAwaitReadiness,
  stopService,
  waitForShutdownOrServiceExit,
} from "#/service-process.js";
import type { DesktopServiceRole, ServiceProcess } from "#/service-process.js";
import { discoverSystemBrowser } from "#/system-browser-discovery.js";
import type { SystemBrowserDiscovery } from "#/system-browser-discovery.js";

const dashboardUrl = "http://127.0.0.1:54311";

function runtimeLogPath(layout: DesktopProductLayout): string {
  return path.join(layout.logDirectory, "runtime.log");
}

function protocolSystemBrowserDiagnostic(
  systemBrowser: SystemBrowserDiscovery,
): NonNullable<RuntimeStatusInput["systemBrowser"]> {
  return {
    detail: systemBrowser.detail,
    ...("family" in systemBrowser
      ? {
          family:
            systemBrowser.family === "Chrome"
              ? SystemBrowserFamily.CHROME
              : SystemBrowserFamily.EDGE,
        }
      : {}),
    state: protocolSystemBrowserState(systemBrowser.state),
    ...("version" in systemBrowser ? { version: systemBrowser.version } : {}),
  };
}

function protocolSystemBrowserState(state: SystemBrowserDiscovery["state"]): SystemBrowserState {
  return (
    {
      missing: SystemBrowserState.MISSING,
      recognized: SystemBrowserState.RECOGNIZED,
      uninspectable: SystemBrowserState.UNINSPECTABLE,
    } satisfies Record<SystemBrowserDiscovery["state"], SystemBrowserState>
  )[state];
}

function emitStatus(
  layout: DesktopProductLayout,
  statusMessage: Omit<RuntimeStatusInput, "logPath">,
): void {
  process.stdout.write(
    encodeRuntimeStatus({
      ...statusMessage,
      logPath: runtimeLogPath(layout),
    }),
  );
}

function protocolRuntimeState(state: "failed" | "running" | "starting" | "stopping"): RuntimeState {
  return {
    failed: RuntimeState.FAILED,
    running: RuntimeState.RUNNING,
    starting: RuntimeState.STARTING,
    stopping: RuntimeState.STOPPING,
  }[state];
}

function runtimeStatus(
  detail: string,
  state: "failed" | "running" | "starting" | "stopping",
  fields: Omit<RuntimeStatusInput, "detail" | "logPath" | "state"> = {},
): Omit<RuntimeStatusInput, "logPath"> {
  return {
    ...fields,
    detail,
    state: protocolRuntimeState(state),
  };
}

function installShutdownInputs(requestShutdown: () => void): () => void {
  async function readCommands(): Promise<void> {
    for await (const message of readManagerMessages(process.stdin)) {
      if (message.command.case === "shutdown") {
        requestShutdown();
        return;
      }
    }
    requestShutdown();
  }
  readCommands().catch((error: unknown) => {
    process.stderr.write(`[Desktop Runtime] Manager command channel failed: ${String(error)}\n`);
    requestShutdown();
  });
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  return () => {
    process.stdin.pause();
    process.removeListener("SIGINT", requestShutdown);
    process.removeListener("SIGTERM", requestShutdown);
  };
}

function serviceStartups(systemBrowser: SystemBrowserDiscovery): {
  readonly detail: string;
  readonly healthUrl: string;
  readonly role: DesktopServiceRole;
}[] {
  return [
    {
      detail: "Starting Workspace Service",
      healthUrl: "http://127.0.0.1:54310/health",
      role: "workspace-service",
    },
    {
      detail: "Starting Dashboard Host",
      healthUrl: `${dashboardUrl}/health`,
      role: "dashboard-host",
    },
    ...(systemBrowser.state === "recognized"
      ? [
          {
            detail: "Starting Browser Session",
            healthUrl: "http://127.0.0.1:54312/health",
            role: "browser-session" as const,
          },
        ]
      : []),
  ];
}

function* startServices(
  layout: DesktopProductLayout,
  systemBrowser: SystemBrowserDiscovery,
  waitForShutdown: () => RiteCoroutine<void>,
  serviceProcesses: ServiceProcess[],
): RiteCoroutine<boolean> {
  for (const startup of serviceStartups(systemBrowser)) {
    emitStatus(
      layout,
      runtimeStatus(startup.detail, "starting", {
        systemBrowser: protocolSystemBrowserDiagnostic(systemBrowser),
      }),
    );
    const result = yield* startServiceAndAwaitReadiness(
      {
        healthUrl: startup.healthUrl,
        layout,
        role: startup.role,
        systemBrowser,
      },
      waitForShutdown,
    );
    serviceProcesses.push(result.serviceProcess);
    if (result.kind === "shutdown") {
      return false;
    }
  }
  return true;
}

function* superviseServices(
  layout: DesktopProductLayout,
  systemBrowser: SystemBrowserDiscovery,
  waitForShutdown: () => RiteCoroutine<void>,
): RiteCoroutine<void> {
  const serviceProcesses: ServiceProcess[] = [];
  try {
    if (!(yield* startServices(layout, systemBrowser, waitForShutdown, serviceProcesses))) {
      return;
    }

    emitStatus(
      layout,
      runtimeStatus(
        systemBrowser.state === "recognized"
          ? "All desktop services are running."
          : `Workspace and Dashboard are running. ${systemBrowser.detail}`,
        "running",
        {
          dashboardUrl,
          systemBrowser: protocolSystemBrowserDiagnostic(systemBrowser),
        },
      ),
    );
    yield* waitForShutdownOrServiceExit(serviceProcesses, waitForShutdown);
  } finally {
    emitStatus(
      layout,
      runtimeStatus("Stopping desktop services.", "stopping", {
        systemBrowser: protocolSystemBrowserDiagnostic(systemBrowser),
      }),
    );
    for (const serviceProcess of serviceProcesses.toReversed()) {
      yield* stopService(serviceProcess);
    }
  }
}

export function* runDesktopRuntime(layout: DesktopProductLayout): RiteCoroutine<void> {
  const shutdown = yield* completer<true>();
  function* waitForShutdown(): RiteCoroutine<void> {
    yield* wait(shutdown.future);
  }
  const removeShutdownInputs = installShutdownInputs(() => shutdown.resolve(true));
  try {
    emitStatus(layout, runtimeStatus("Discovering a system browser", "starting"));
    const systemBrowser = yield* until(() => discoverSystemBrowser());
    yield* superviseServices(layout, systemBrowser, waitForShutdown);
  } catch (error) {
    emitStatus(layout, runtimeStatus(String(error), "failed"));
    throw error;
  } finally {
    removeShutdownInputs();
  }
}
