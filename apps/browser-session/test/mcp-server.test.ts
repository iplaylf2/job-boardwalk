import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import type { BrowserToolBackend } from "#/browser/tool-backend.js";
import { createBrowserSessionMcpServer } from "#/mcp-server.js";

const firstContentIndex = 0;

function fakeBackend(): BrowserToolBackend & {
  executions: { input: Record<string, unknown>; toolName: string }[];
} {
  const executions: { input: Record<string, unknown>; toolName: string }[] = [];
  return {
    *execute(toolName, input) {
      yield* [];
      executions.push({ input, toolName });
      return { title: "BOSS", url: "https://www.zhipin.com/" };
    },
    executions,
    status: {
      browserVersion: "150.0.0.0",
      connected: true,
      origin: "http://localhost",
      pageCount: 1,
    },
  };
}

function* disconnectedBrowserCall() {
  yield* [];
  throw new Error("CDP 浏览器尚未连接。");
}

async function connectedClient(
  mcpServer: McpServer,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const client = new Client({ name: "browser-session-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await mcpServer.close();
    },
  };
}

test("always exposes the project-owned Patchright browser tools", async () => {
  await using serviceScope = createScope();
  const browserBackend = fakeBackend();
  const mcpServer = createBrowserSessionMcpServer(browserBackend, serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const listedTools = await client.listTools();
  const names = listedTools.tools.map(({ name }) => name);
  expect(names).toEqual([
    "browser_session_status",
    "browser_tabs",
    "browser_navigate",
    "browser_snapshot",
    "browser_click",
    "browser_fill",
    "browser_select",
    "browser_scroll",
    "browser_wait",
  ]);
  const tabsTool = listedTools.tools.find(({ name }) => name === "browser_tabs");
  expect(tabsTool?.inputSchema.properties?.["action"]).toMatchObject({
    enum: ["list", "open", "activate"],
  });
  const clickTool = listedTools.tools.find(({ name }) => name === "browser_click");
  expect(clickTool?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
  const snapshotTool = listedTools.tools.find(({ name }) => name === "browser_snapshot");
  expect(snapshotTool?.annotations).toMatchObject({ readOnlyHint: true });

  const result = CallToolResultSchema.parse(
    await client.callTool({ arguments: { action: "list" }, name: "browser_tabs" }),
  );
  expect(browserBackend.executions).toEqual([
    { input: { action: "list" }, toolName: "browser_tabs" },
  ]);
  expect(result.content[firstContentIndex]).toMatchObject({
    text: expect.stringContaining("https://www.zhipin.com/"),
  });
  await close();
});

test("reports CDP status without sending a browser command", async () => {
  await using serviceScope = createScope();
  const browserBackend = fakeBackend();
  const mcpServer = createBrowserSessionMcpServer(browserBackend, serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const result = CallToolResultSchema.parse(
    await client.callTool({ name: "browser_session_status" }),
  );
  expect(result.content[firstContentIndex]).toMatchObject({
    text: expect.stringContaining('"connected": true'),
  });
  expect(browserBackend.executions).toEqual([]);
  await close();
});

test("contains a disconnected CDP browser as a tool error", async () => {
  await using serviceScope = createScope();
  const browserBackend = fakeBackend();
  browserBackend.execute = () => disconnectedBrowserCall();
  const mcpServer = createBrowserSessionMcpServer(browserBackend, serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const result = CallToolResultSchema.parse(
    await client.callTool({ arguments: {}, name: "browser_snapshot" }),
  );
  expect(result.isError).toBe(true);
  expect(result.content[firstContentIndex]).toMatchObject({
    text: "CDP 浏览器尚未连接。",
  });
  await close();
});
