import { createRequire } from "node:module";
import process from "node:process";

import { installStdinShutdown } from "#/stdin-shutdown.js";

interface DesktopServiceModule {
  readonly serviceCompletion: PromiseLike<void>;
}

interface ServiceRoleDependencies {
  readonly installShutdown: () => () => void;
  readonly loadModule: (entrypoint: string) => unknown;
}

const defaultDependencies: ServiceRoleDependencies = {
  installShutdown: installStdinShutdown,
  loadModule: createRequire(process.execPath),
};

function readServiceCompletion(module: unknown): PromiseLike<void> {
  if (
    typeof module !== "object" ||
    module === null ||
    !("serviceCompletion" in module) ||
    typeof module.serviceCompletion !== "object" ||
    module.serviceCompletion === null ||
    !("then" in module.serviceCompletion) ||
    typeof module.serviceCompletion.then !== "function"
  ) {
    throw new TypeError("The desktop service entrypoint must export serviceCompletion.");
  }
  return (module as DesktopServiceModule).serviceCompletion;
}

export function runServiceRole(
  entrypoint: string,
  dependencies: ServiceRoleDependencies = defaultDependencies,
): Promise<void> {
  const serviceCompletion = readServiceCompletion(dependencies.loadModule(entrypoint));
  const removeShutdownAdapter = dependencies.installShutdown();
  return Promise.resolve(serviceCompletion).finally(removeShutdownAdapter);
}
