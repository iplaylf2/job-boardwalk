import process from "node:process";
import { inspect } from "node:util";

import { parseBrowserSessionArguments } from "./process-arguments.js";
import { runBrowserSessionProcess } from "./runtime.js";

const userArgumentStartIndex = 2;

function installTerminationSignalHandlers(controller: AbortController): () => void {
  function requestShutdown(signal: string): void {
    process.stderr.write(
      `[${new Date().toISOString()}] [Browser Session] Shutdown requested: ${signal}\n`,
    );
    controller.abort();
  }
  function onInterrupt(): void {
    requestShutdown("SIGINT");
  }
  function onTerminate(): void {
    requestShutdown("SIGTERM");
  }
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  return () => {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  };
}

const shutdownController = new AbortController();
const removeTerminationSignalHandlers = installTerminationSignalHandlers(shutdownController);

// oxlint-disable-next-line unicorn/prefer-top-level-await -- The host must receive the pending lifecycle promise.
export const serviceCompletion = runBrowserSessionProcess({
  ...parseBrowserSessionArguments(process.argv.slice(userArgumentStartIndex)),
  shutdownSignal: shutdownController.signal,
}).finally(removeTerminationSignalHandlers);

// oxlint-disable-next-line unicorn/prefer-top-level-await -- Report source-run failures without awaiting the exported lifecycle promise.
serviceCompletion.catch((error: unknown) => {
  // Disposal may wrap the original failure in non-enumerable SuppressedError fields.
  const detail = inspect(error, { colors: false, depth: null, showHidden: true });
  process.stderr.write(
    `[${new Date().toISOString()}] [Browser Session] Service failed: ${detail}\n`,
  );
  process.exitCode = 1;
});
