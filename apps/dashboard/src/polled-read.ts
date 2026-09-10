import { sleep } from "@shajara/host";
import type { RiteCoroutine, RiteRoutine } from "@shajara/host";
import { createMemo, createSignal, onSettled } from "solid-js";

import { reportUnexpectedRoutineFailure, useDashboardRuntime } from "./dashboard-runtime.js";

const initialRefreshCount = 0;
const refreshIncrement = 1;

function* pollRead(refresh: () => void, refreshIntervalMilliseconds: number): RiteCoroutine<never> {
  while (true) {
    yield* sleep(refreshIntervalMilliseconds);
    refresh();
  }
}

export function createPolledRead<Result>(
  read: RiteRoutine<Result>,
  refreshIntervalMilliseconds: number,
): {
  data: () => Result | undefined;
  refresh: () => void;
} {
  const runtime = useDashboardRuntime();
  let activeReadController: AbortController | null = null;
  const [refreshCount, setRefreshCount] = createSignal(initialRefreshCount);
  const data = createMemo(() => {
    refreshCount();
    activeReadController?.abort();
    activeReadController = new AbortController();
    return runtime.run(read(), { signal: activeReadController.signal });
  });
  function refresh(): void {
    setRefreshCount((value) => value + refreshIncrement);
  }

  onSettled(() => {
    const pollingController = new AbortController();
    runtime
      .run(pollRead(refresh, refreshIntervalMilliseconds), {
        signal: pollingController.signal,
      })
      .catch(reportUnexpectedRoutineFailure);
    return () => {
      activeReadController?.abort();
      pollingController.abort();
    };
  });

  return { data, refresh };
}
