import process from "node:process";

interface StdinShutdownDependencies {
  readonly onStdinEnd: (listener: () => void) => void;
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
  requestTermination: requestServiceTermination,
  resumeStdin: () => process.stdin.resume(),
};

export function installStdinShutdown(
  dependencies: StdinShutdownDependencies = defaultDependencies,
): void {
  dependencies.onStdinEnd(dependencies.requestTermination);
  dependencies.resumeStdin();
}
