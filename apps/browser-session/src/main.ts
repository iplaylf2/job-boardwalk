import process from "node:process";

import { parseBrowserSessionArguments } from "./process-arguments.js";
import { runBrowserSessionProcess } from "./runtime.js";

const userArgumentStartIndex = 2;

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

const shutdownController = new AbortController();
const removeTerminationSignalHandlers = installTerminationSignalHandlers(shutdownController);

// oxlint-disable-next-line unicorn/prefer-top-level-await -- The desktop payload is a loadable CommonJS role module.
runBrowserSessionProcess({
  ...parseBrowserSessionArguments(process.argv.slice(userArgumentStartIndex)),
  shutdownSignal: shutdownController.signal,
})
  .catch((error: unknown) => {
    process.stderr.write(`[Browser Session] ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(removeTerminationSignalHandlers);
