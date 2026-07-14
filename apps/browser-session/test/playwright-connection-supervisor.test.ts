import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { completer, createScope, run } from "@shajara/host";
import type { Completer, RiteCoroutine } from "@shajara/host";
import { race, wait } from "@shajara/host/primitives";
import { expect, test } from "vitest";

import { PlaywrightConnectionSupervisor } from "#/playwright-connection-supervisor.js";
import type { PlaywrightMcpClient } from "#/playwright-mcp-client.js";

const firstAttempt = 1;
const initialCount = 0;
const noRetryDelay = 0;
const secondAttempt = 2;

interface RecoveryContext {
  attempts: number;
  firstDisconnected: Completer<Error>;
  liveFailureReported: Completer<Error>;
  readyAfterReconnect: Completer<true>;
  readyAfterStartup: Completer<true>;
  secondConnection: Completer<PlaywrightMcpClient>;
  startupFailureReported: Completer<Error>;
  supervisor: PlaywrightConnectionSupervisor;
  unavailableAfterDisconnect: Completer<true>;
}

function* close(): RiteCoroutine<void> {
  yield* [];
}

function fakeClient(disconnected: Completer<Error>, name: string): PlaywrightMcpClient {
  const tools: Tool[] = [
    {
      inputSchema: { properties: {}, type: "object" },
      name,
    },
  ];
  return {
    callTool: function* callTool(): RiteCoroutine<CallToolResult> {
      yield* [];
      return { content: [{ text: name, type: "text" }] };
    },
    close,
    disconnected: disconnected.future,
    tools,
  } as unknown as PlaywrightMcpClient;
}

function* connectForRecovery(context: RecoveryContext): RiteCoroutine<PlaywrightMcpClient> {
  context.attempts += firstAttempt;
  if (context.attempts === firstAttempt) {
    throw new Error("initial handshake failed");
  }
  if (context.attempts === secondAttempt) {
    return fakeClient(context.firstDisconnected, "browser_first");
  }
  return yield* wait(context.secondConnection.future);
}

function reportRecoveryError(context: RecoveryContext, error: Error): void {
  if (error.message === "initial handshake failed") {
    context.startupFailureReported.resolve(error);
  }
  if (error.message === "live transport closed") {
    context.liveFailureReported.resolve(error);
  }
}

function createToolChangeNotifier(context: RecoveryContext): () => Promise<void> {
  let toolsAvailable = false;
  let hasConnected = false;
  return () => {
    toolsAvailable = !toolsAvailable;
    if (toolsAvailable && !hasConnected) {
      hasConnected = true;
      context.readyAfterStartup.resolve(true);
    } else if (toolsAvailable) {
      context.readyAfterReconnect.resolve(true);
    } else {
      context.unavailableAfterDisconnect.resolve(true);
    }
    return Promise.resolve();
  };
}

function* verifyRecovery(context: RecoveryContext): RiteCoroutine<void> {
  expect((yield* wait(context.startupFailureReported.future)).message).toBe(
    "initial handshake failed",
  );
  yield* wait(context.readyAfterStartup.future);
  expect(context.supervisor.tools.map(({ name }) => name)).toEqual(["browser_first"]);

  context.firstDisconnected.resolve(new Error("live transport closed"));
  expect((yield* wait(context.liveFailureReported.future)).message).toBe("live transport closed");
  yield* wait(context.unavailableAfterDisconnect.future);
  expect(context.supervisor.tools).toEqual([]);

  const secondDisconnected = yield* completer<Error>();
  context.secondConnection.resolve(fakeClient(secondDisconnected, "browser_second"));
  yield* wait(context.readyAfterReconnect.future);
  expect(context.supervisor.tools.map(({ name }) => name)).toEqual(["browser_second"]);
}

function* recoverConnections(): RiteCoroutine<void> {
  const context: RecoveryContext = {
    attempts: initialCount,
    firstDisconnected: yield* completer<Error>(),
    liveFailureReported: yield* completer<Error>(),
    readyAfterReconnect: yield* completer<true>(),
    readyAfterStartup: yield* completer<true>(),
    secondConnection: yield* completer<PlaywrightMcpClient>(),
    startupFailureReported: yield* completer<Error>(),
    supervisor: new PlaywrightConnectionSupervisor(),
    unavailableAfterDisconnect: yield* completer<true>(),
  };
  yield* race([
    () =>
      context.supervisor.supervise({
        connect: () => connectForRecovery(context),
        notifyToolsChanged: createToolChangeNotifier(context),
        reportError: (error) => reportRecoveryError(context, error),
        retryDelay: () => noRetryDelay,
      }),
    () => verifyRecovery(context),
  ]);
}

test("recovers from startup and live-connection failures", async () => {
  await using scope = createScope();
  await scope.run(recoverConnections);
});

test("does not reclassify a downstream notification failure as an upstream failure", () =>
  run(function* preserveNotificationBoundary() {
    const disconnected = yield* completer<Error>();
    const reportedErrors: Error[] = [];
    const supervisor = new PlaywrightConnectionSupervisor();
    try {
      yield* supervisor.supervise({
        connect: function* connect() {
          yield* [];
          return fakeClient(disconnected, "browser_ready");
        },
        notifyToolsChanged: () => Promise.reject(new Error("downstream transport closed")),
        reportError: (error) => reportedErrors.push(error),
      });
      throw new Error("下游通知失败不应进入上游重连循环");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("downstream transport closed");
      expect(reportedErrors).toEqual([]);
    }
  }));
