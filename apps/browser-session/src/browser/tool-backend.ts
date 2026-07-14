import type { RiteCoroutine } from "@shajara/host";

export interface BrowserBackendStatus {
  browserVersion?: string;
  connected: boolean;
  lastError?: string;
  origin: string;
  pageCount?: number;
}

export interface BrowserToolBackend {
  execute: (toolName: string, input: Record<string, unknown>) => RiteCoroutine<unknown>;
  status: BrowserBackendStatus;
}
