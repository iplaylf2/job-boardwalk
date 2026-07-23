import { createContext, useContext } from "solid-js";
import { CanceledError, InterruptedError, ScopeError, createScope } from "@shajara/host";
import type { RiteCoroutine, RunOptions } from "@shajara/host";

interface FulfilledRoutine<Return> {
  status: "fulfilled";
  value: Return;
}

interface RejectedRoutine {
  error: unknown;
  status: "rejected";
}

type RoutineOutcome<Return> = FulfilledRoutine<Return> | RejectedRoutine;

export interface DashboardRuntime {
  close: () => Promise<void>;
  run: <Return>(routine: RiteCoroutine<Return>, options?: RunOptions) => Promise<Return>;
}

function isRuntimeConvergence(error: unknown): boolean {
  return (
    error instanceof CanceledError ||
    error instanceof InterruptedError ||
    error instanceof ScopeError
  );
}

function* captureRoutineOutcome<Return>(
  routine: RiteCoroutine<Return>,
): RiteCoroutine<RoutineOutcome<Return>> {
  try {
    return { status: "fulfilled", value: yield* routine };
  } catch (error) {
    if (isRuntimeConvergence(error)) {
      throw error;
    }
    return { error, status: "rejected" };
  }
}

function outcomeValue<Return>(outcome: RoutineOutcome<Return>): Return {
  if (outcome.status === "rejected") {
    throw outcome.error;
  }
  return outcome.value;
}

export function createDashboardRuntime(): DashboardRuntime {
  const scope = createScope();
  return {
    close: () => scope.cancel(),
    run: (routine, options) =>
      scope.run(() => captureRoutineOutcome(routine), options).then(outcomeValue),
  };
}

export const DashboardRuntimeContext = createContext<DashboardRuntime>();

export function useDashboardRuntime(): DashboardRuntime {
  return useContext(DashboardRuntimeContext);
}

export function reportUnexpectedRoutineFailure(error: unknown): void {
  if (error instanceof CanceledError) {
    return;
  }
  throw error;
}
