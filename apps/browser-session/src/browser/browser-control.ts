import type { RiteCoroutine } from "@shajara/host";
import type { BrowserRuntimeStatus } from "@job-boardwalk/contracts";

export interface BrowserControl {
  executeTool: (toolName: string, input: Record<string, unknown>) => RiteCoroutine<unknown>;
  readonly status: BrowserRuntimeStatus;
}
