import { createScope } from "@shajara/host";

import { parseWorkspaceServiceArguments } from "./src/runtime/process-arguments.js";
import { runWorkspaceService } from "./src/runtime/service-lifecycle.js";

const userArgumentStartIndex = 2;

async function main(): Promise<void> {
  await using serviceScope = createScope();
  const options = parseWorkspaceServiceArguments(process.argv.slice(userArgumentStartIndex));
  await serviceScope.run(() => runWorkspaceService(serviceScope, options));
}

// oxlint-disable-next-line unicorn/prefer-top-level-await -- SEA loads this finalized ESM artifact through createRequire.
main().catch((error: unknown) => {
  process.stderr.write(`[Workspace Service] ${String(error)}\n`);
  process.exitCode = 1;
});
