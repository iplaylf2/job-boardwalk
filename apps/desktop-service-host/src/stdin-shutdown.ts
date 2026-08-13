import process from "node:process";

interface StdinShutdownDependencies {
  readonly pauseStdin: () => void;
  readonly onStdinEnd: (listener: () => void) => void;
  readonly removeStdinEndListener: (listener: () => void) => void;
  readonly requestTermination: () => void;
  readonly resumeStdin: () => void;
}

interface TerminationSignalEmitter {
  readonly emit: (event: "SIGTERM", signal: "SIGTERM") => boolean;
}

export function requestServiceTermination(signalEmitter: TerminationSignalEmitter = process): void {
  signalEmitter.emit("SIGTERM", "SIGTERM");
}

const defaultDependencies: StdinShutdownDependencies = {
  onStdinEnd: (listener) => process.stdin.once("end", listener),
  pauseStdin: () => process.stdin.pause(),
  removeStdinEndListener: (listener) => process.stdin.removeListener("end", listener),
  requestTermination: requestServiceTermination,
  resumeStdin: () => process.stdin.resume(),
};

export function installStdinShutdown(
  dependencies: StdinShutdownDependencies = defaultDependencies,
): () => void {
  function requestTermination(): void {
    dependencies.requestTermination();
  }
  dependencies.onStdinEnd(requestTermination);
  dependencies.resumeStdin();
  return () => {
    dependencies.removeStdinEndListener(requestTermination);
    dependencies.pauseStdin();
  };
}
