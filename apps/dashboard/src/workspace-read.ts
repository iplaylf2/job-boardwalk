import { createMemo, createSignal, onSettled } from "solid-js";

const initialRefreshCount = 0;
const refreshIncrement = 1;

export function createWorkspaceRead<Result>(
  read: () => Promise<Result>,
  refreshIntervalMilliseconds: number,
): {
  data: () => Result | undefined;
  refresh: () => void;
} {
  const [refreshCount, setRefreshCount] = createSignal(initialRefreshCount);
  const data = createMemo(() => {
    refreshCount();
    return read();
  });
  function refresh(): void {
    setRefreshCount((value) => value + refreshIncrement);
  }

  onSettled(() => {
    const interval = setInterval(refresh, refreshIntervalMilliseconds);
    return () => clearInterval(interval);
  });

  return { data, refresh };
}
