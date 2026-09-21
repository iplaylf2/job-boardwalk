import { createSignal } from "solid-js";
import type { Accessor } from "solid-js";
import type { RiteCoroutine } from "@shajara/host";
import { useDashboardRuntime } from "#/dashboard-runtime.js";

export interface PersonalContextMutation {
  clearError: () => void;
  error: Accessor<string>;
  run: (
    operation: () => RiteCoroutine<void>,
    failureMessage: string,
    onSuccess: () => void,
  ) => Promise<void>;
  pending: Accessor<boolean>;
}

export function createPersonalContextMutation(): PersonalContextMutation {
  const runtime = useDashboardRuntime();
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);
  async function run(
    operation: () => RiteCoroutine<void>,
    failureMessage: string,
    onSuccess: () => void,
  ): Promise<void> {
    setPending(true);
    setError("");
    try {
      await runtime.run(operation());
      onSuccess();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : failureMessage);
    } finally {
      setPending(false);
    }
  }
  return { clearError: () => setError(""), error, pending, run };
}
