import process from "node:process";
import { createRequire } from "node:module";

import { resolveDesktopProductLayout } from "@job-boardwalk/desktop-product-layout";
import { createScope } from "@shajara/host";

import { runDashboardHost } from "#/dashboard-host.js";
import { runApplicationSupervisor } from "#/supervisor.js";

const workspaceServiceHostname = "127.0.0.1";
const workspaceServicePort = 54_310;
const dashboardHostname = "127.0.0.1";
const dashboardPort = 54_311;
const userArgumentStartIndex = 2;

type ApplicationRuntimeRole = "dashboard-host" | "supervisor" | "workspace-service";

function parseApplicationRuntimeRole(arguments_: readonly string[]): ApplicationRuntimeRole {
  const roleArgument = arguments_.find((argument) => argument.startsWith("--role="));
  const role = roleArgument?.slice("--role=".length) ?? "supervisor";
  if (role === "dashboard-host" || role === "supervisor" || role === "workspace-service") {
    return role;
  }
  throw new Error(`Unknown application runtime role: ${role}`);
}

async function main(): Promise<void> {
  const layout = resolveDesktopProductLayout(process.execPath);
  const role = parseApplicationRuntimeRole(process.argv.slice(userArgumentStartIndex));

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

  await using serviceScope = createScope();
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
      : () => runApplicationSupervisor(layout);
  await serviceScope.run(routine);
}

// oxlint-disable-next-line unicorn/prefer-top-level-await -- Node SEA embeds a CommonJS entry script.
main().catch((error: unknown) => {
  process.stderr.write(`[Application Runtime] ${String(error)}\n`);
  process.exitCode = 1;
});
