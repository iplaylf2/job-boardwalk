import { createScope } from "@shajara/host";

import { parseWorkspaceServiceArguments } from "./src/runtime/process-arguments.js";
import { runWorkspaceService } from "./src/runtime/service-lifecycle.js";

const userArgumentStartIndex = 2;

function errorDetail(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function installTerminationSignalHandlers(controller: AbortController): () => void {
  function requestShutdown(): void {
    controller.abort();
  }
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  return () => {
    process.removeListener("SIGINT", requestShutdown);
    process.removeListener("SIGTERM", requestShutdown);
  };
}

async function main(shutdownSignal: AbortSignal): Promise<void> {
  await using serviceScope = createScope();
  const options = {
    ...parseWorkspaceServiceArguments(process.argv.slice(userArgumentStartIndex)),
    shutdownSignal,
  };
  await serviceScope.run(() => runWorkspaceService(serviceScope, options));
}

const shutdownController = new AbortController();
const removeTerminationSignalHandlers = installTerminationSignalHandlers(shutdownController);

// oxlint-disable-next-line unicorn/prefer-top-level-await -- SEA loads this finalized ESM artifact through createRequire.
main(shutdownController.signal)
  .catch((error: unknown) => {
    process.stderr.write(`[Workspace Service] ${errorDetail(error)}\n`);
    process.exitCode = 1;
  })
  .finally(removeTerminationSignalHandlers);
