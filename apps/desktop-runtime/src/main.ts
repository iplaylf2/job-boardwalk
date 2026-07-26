import process from "node:process";
import { createRequire } from "node:module";

import { resolveDesktopProductLayout } from "@job-boardwalk/desktop-product-layout";
import { createScope } from "@shajara/host";

import { runDashboardHost } from "#/dashboard-host.js";
import { runDesktopRuntime } from "#/lifecycle.js";

const workspaceServiceHostname = "127.0.0.1";
const workspaceServicePort = 54_310;
const dashboardHostname = "127.0.0.1";
const dashboardPort = 54_311;
const userArgumentStartIndex = 2;

type DesktopRuntimeRole =
  | "browser-session"
  | "coordinator"
  | "dashboard-host"
  | "workspace-service";

function parseDesktopRuntimeRole(arguments_: readonly string[]): DesktopRuntimeRole {
  const roleArgument = arguments_.find((argument) => argument.startsWith("--role="));
  const role = roleArgument?.slice("--role=".length) ?? "coordinator";
  if (
    role === "browser-session" ||
    role === "coordinator" ||
    role === "dashboard-host" ||
    role === "workspace-service"
  ) {
    return role;
  }
  throw new Error(`Unknown desktop runtime role: ${role}`);
}

async function main(): Promise<void> {
  const layout = resolveDesktopProductLayout(process.execPath);
  const role = parseDesktopRuntimeRole(process.argv.slice(userArgumentStartIndex));

  if (role === "workspace-service") {
    process.argv.push(
      `--workspace-database-path=${layout.workspaceDatabasePath}`,
      `--migrations-directory=${layout.migrationsDirectory}`,
      `--hostname=${workspaceServiceHostname}`,
      `--port=${workspaceServicePort}`,
    );
    createRequire(process.execPath)(layout.workspaceServiceModule);
    return;
  }

  if (role === "browser-session") {
    createRequire(process.execPath)(layout.browserSessionModule);
    return;
  }

  await using processScope = createScope();
  const routine =
    role === "dashboard-host"
      ? () =>
          runDashboardHost({
            dashboardDirectory: layout.dashboardDirectory,
            hostname: dashboardHostname,
            port: dashboardPort,
            workspaceServiceHostname,
            workspaceServicePort,
          })
      : () => runDesktopRuntime(layout);
  await processScope.run(routine);
}

// oxlint-disable-next-line unicorn/prefer-top-level-await -- Node SEA embeds a CommonJS entry script.
main().catch((error: unknown) => {
  process.stderr.write(`[Desktop Runtime] ${String(error)}\n`);
  process.exitCode = 1;
});
