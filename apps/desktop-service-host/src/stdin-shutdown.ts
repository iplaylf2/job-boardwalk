import process from "node:process";

interface StdinShutdownDependencies {
  readonly onStdinEnd: (listener: () => void) => void;
  readonly requestTermination: () => void;
  readonly resumeStdin: () => void;
}

const defaultDependencies: StdinShutdownDependencies = {
  onStdinEnd: (listener) => process.stdin.once("end", listener),
  requestTermination: () => {
    process.kill(process.pid, "SIGTERM");
  },
  resumeStdin: () => process.stdin.resume(),
};

export function installStdinShutdown(
  dependencies: StdinShutdownDependencies = defaultDependencies,
): void {
  dependencies.onStdinEnd(dependencies.requestTermination);
  dependencies.resumeStdin();
}
