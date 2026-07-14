import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CanceledError, ScopeError, sleep, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import { redactPlaywrightError } from "./playwright-mcp-client.js";
import type { PlaywrightMcpClient } from "./playwright-mcp-client.js";

const initialFailureCount = 0;
const firstFailureCount = 1;
const retryDelayBaseMilliseconds = 1000;
const retryDelayMaximumMilliseconds = 30_000;
const retryExponentMaximum = 5;
const retryExponentBase = 2;

type ConnectionState =
  | { client: PlaywrightMcpClient; status: "ready" }
  | { lastError?: Error; status: "connecting" };

interface ConnectionAttempt {
  client: PlaywrightMcpClient | null;
  failureCount: number;
}

export type ConnectPlaywrightMcpClient = () => RiteCoroutine<PlaywrightMcpClient>;

export interface PlaywrightConnectionSupervisorOptions {
  connect: ConnectPlaywrightMcpClient;
  notifyToolsChanged: () => Promise<void>;
  reportError: (error: Error) => void;
  retryDelay?: (failureCount: number) => number;
}

function defaultRetryDelay(failureCount: number): number {
  const exponent = Math.min(failureCount - firstFailureCount, retryExponentMaximum);
  return Math.min(
    retryDelayMaximumMilliseconds,
    retryDelayBaseMilliseconds * retryExponentBase ** exponent,
  );
}

function* closeClient(
  client: PlaywrightMcpClient,
  reportError: (error: Error) => void,
): RiteCoroutine<void> {
  try {
    yield* client.close();
  } catch (error) {
    reportError(redactPlaywrightError(error));
  }
}

export class PlaywrightConnectionSupervisor {
  #state: ConnectionState = { status: "connecting" };

  public get tools(): readonly Tool[] {
    return this.#state.status === "ready" ? this.#state.client.tools : [];
  }

  public *callTool(params: CallToolRequest["params"]): RiteCoroutine<CallToolResult> {
    if (this.#state.status !== "ready") {
      const detail = this.#state.lastError
        ? `最近一次连接失败：${this.#state.lastError.message}`
        : "上游连接尚未就绪。";
      throw new Error(`浏览器暂不可用，Browser Session 正在重新连接。${detail}`);
    }
    return yield* this.#state.client.callTool(params);
  }

  public *supervise({
    connect,
    notifyToolsChanged,
    reportError,
    retryDelay = defaultRetryDelay,
  }: PlaywrightConnectionSupervisorOptions): RiteCoroutine<never> {
    let failureCount = initialFailureCount;
    while (true) {
      const { client, failureCount: attemptFailureCount } = yield* this.#attemptConnection(
        connect,
        failureCount,
        notifyToolsChanged,
        reportError,
      );
      failureCount = attemptFailureCount;
      if (client) {
        failureCount = initialFailureCount;
        try {
          yield* this.#transition({ client, status: "ready" }, notifyToolsChanged);
          failureCount = yield* this.#recordFailure(
            yield* wait(client.disconnected),
            failureCount,
            notifyToolsChanged,
            reportError,
          );
        } finally {
          yield* closeClient(client, reportError);
        }
      }
      yield* sleep(retryDelay(failureCount));
      continue;
    }
  }

  #setState(state: ConnectionState): boolean {
    const toolAvailabilityChanged = (this.#state.status === "ready") !== (state.status === "ready");
    this.#state = state;
    return toolAvailabilityChanged;
  }

  *#attemptConnection(
    connect: ConnectPlaywrightMcpClient,
    failureCount: number,
    notify: () => Promise<void>,
    reportError: (error: Error) => void,
  ): RiteCoroutine<ConnectionAttempt> {
    try {
      return { client: yield* connect(), failureCount };
    } catch (error) {
      return {
        client: null,
        failureCount: yield* this.#recordFailure(error, failureCount, notify, reportError),
      };
    }
  }

  *#recordFailure(
    error: unknown,
    failureCount: number,
    notify: () => Promise<void>,
    reportError: (error: Error) => void,
  ): RiteCoroutine<number> {
    if (error instanceof CanceledError || error instanceof ScopeError) {
      throw error;
    }
    const redacted = redactPlaywrightError(error);
    reportError(redacted);
    yield* this.#transition({ lastError: redacted, status: "connecting" }, notify);
    return failureCount + firstFailureCount;
  }

  *#transition(state: ConnectionState, notify: () => Promise<void>): RiteCoroutine<void> {
    if (this.#setState(state)) {
      yield* until(notify);
    }
  }
}
