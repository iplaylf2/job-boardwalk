import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createScope } from "@shajara/host";
import type { BrowserContext } from "patchright";
import { expect, test } from "vitest";

import type { BrowserControl } from "#/browser/browser-control.js";
import { BrowserTabs } from "#/browser/browser-tabs.js";
import { BrowserToolExecutor } from "#/browser/tool-executor.js";
import { BackgroundCollectionControl } from "#/browser/background-collection-control.js";
import { createBrowserSessionMcpServer } from "#/mcp-server.js";

const firstContentIndex = 0;
const outOfRangeWaitMilliseconds = 10_001;

function fakeBrowserControl(): BrowserControl & {
  executions: { input: Record<string, unknown>; toolName: string }[];
} {
  const executions: { input: Record<string, unknown>; toolName: string }[] = [];
  return {
    *executeTool(toolName, input) {
      yield* [];
      executions.push({ input, toolName });
      return { title: "BOSS", url: "https://www.zhipin.com/" };
    },
    executions,
    status: {
      available: true,
      browserVersion: "150.0.0.0",
      tabCount: 1,
    },
  };
}

function* unavailableBrowserCall() {
  yield* [];
  throw new Error("浏览器尚未就绪。");
}

function browserToolExecutorControl(): BrowserControl {
  const context = { on: () => context, pages: () => [] } as unknown as BrowserContext;
  const executor = new BrowserToolExecutor(
    new BrowserTabs(context),
    () => null,
    new BackgroundCollectionControl(),
    {
      recordReturnedControl: () => null,
      synchronizeJobEngagement: () => expect.unreachable("此测试不应同步岗位跟进"),
    },
  );
  return {
    executeTool: (toolName, input) => executor.execute(toolName, input),
    status: { available: true, tabCount: 0 },
  };
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
  const browserControl = fakeBrowserControl();
  const mcpServer = createBrowserSessionMcpServer(browserControl, serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const listedTools = await client.listTools();
  const names = new Set(listedTools.tools.map(({ name }) => name));
  expect(names).toEqual(
    new Set([
      "browser_status",
      "browser_tabs",
      "browser_prepare_login",
      "browser_navigate",
      "browser_job_card_snapshot",
      "browser_job_description_snapshot",
      "browser_sync_job_engagement",
      "browser_snapshot",
      "browser_click",
      "browser_fill",
      "browser_select",
      "browser_scroll",
      "browser_wait",
    ]),
  );
  const tabsTool = listedTools.tools.find(({ name }) => name === "browser_tabs");
  const actionSchema = tabsTool?.inputSchema.properties?.["action"] as
    | { enum?: string[] }
    | undefined;
  expect(new Set(actionSchema?.enum)).toEqual(new Set(["list", "ensure", "activate"]));
  expect(tabsTool?.inputSchema.properties?.["platformId"]).toMatchObject({
    enum: ["boss", "yupao"],
  });
  const snapshotTool = listedTools.tools.find(({ name }) => name === "browser_snapshot");
  expect(snapshotTool?.annotations).toMatchObject({
    destructiveHint: false,
    readOnlyHint: false,
  });
  expect(snapshotTool?.inputSchema.properties?.["userReturnedControl"]).toMatchObject({
    type: "boolean",
  });
  expect(snapshotTool?.inputSchema.required).toBeUndefined();
  const engagementTool = listedTools.tools.find(
    ({ name }) => name === "browser_sync_job_engagement",
  );
  expect(engagementTool?.inputSchema.properties?.["engagement"]).toMatchObject({
    enum: expect.arrayContaining(["applied", "contacted", "interested", "interviewed"]),
  });
  expect(engagementTool?.annotations).toMatchObject({
    destructiveHint: true,
    idempotentHint: false,
    readOnlyHint: false,
  });

  const result = CallToolResultSchema.parse(
    await client.callTool({ arguments: { action: "list" }, name: "browser_tabs" }),
  );
  expect(browserControl.executions).toEqual([
    { input: { action: "list" }, toolName: "browser_tabs" },
  ]);
  expect(result.content[firstContentIndex]).toMatchObject({
    text: expect.stringContaining("https://www.zhipin.com/"),
  });

  await close();
});

test("exposes browser action annotations", async () => {
  await using serviceScope = createScope();
  const mcpServer = createBrowserSessionMcpServer(fakeBrowserControl(), serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const listedTools = await client.listTools();
  const clickTool = listedTools.tools.find(({ name }) => name === "browser_click");
  expect(clickTool?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
  const fillTool = listedTools.tools.find(({ name }) => name === "browser_fill");
  expect(fillTool?.annotations).toMatchObject({ destructiveHint: false, readOnlyHint: false });

  await close();
});

test("discloses the access-observation side effect of job-card snapshots", async () => {
  await using serviceScope = createScope();
  const mcpServer = createBrowserSessionMcpServer(fakeBrowserControl(), serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const listedTools = await client.listTools();
  const jobCardSnapshotTool = listedTools.tools.find(
    ({ name }) => name === "browser_job_card_snapshot",
  );
  expect(jobCardSnapshotTool?.annotations).toMatchObject({
    destructiveHint: false,
    readOnlyHint: false,
  });
  expect(jobCardSnapshotTool?.inputSchema.required).toBeUndefined();

  await close();
});

test("exposes and forwards proactive login handoff preparation", async () => {
  await using serviceScope = createScope();
  const browserControl = fakeBrowserControl();
  const mcpServer = createBrowserSessionMcpServer(browserControl, serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const listedTools = await client.listTools();
  const prepareLoginTool = listedTools.tools.find(({ name }) => name === "browser_prepare_login");
  expect(prepareLoginTool?.inputSchema.required).toContain("platformId");

  await client.callTool({ arguments: { platformId: "boss" }, name: "browser_prepare_login" });
  expect(browserControl.executions).toEqual([
    { input: { platformId: "boss" }, toolName: "browser_prepare_login" },
  ]);
  await close();
});

test("reports browser status without sending a browser command", async () => {
  await using serviceScope = createScope();
  const browserControl = fakeBrowserControl();
  const mcpServer = createBrowserSessionMcpServer(browserControl, serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const result = CallToolResultSchema.parse(await client.callTool({ name: "browser_status" }));
  expect(result.content[firstContentIndex]).toMatchObject({
    text: expect.stringContaining('"available": true'),
  });
  expect(browserControl.executions).toEqual([]);
  await close();
});

test("contains an unavailable browser as a tool error", async () => {
  await using serviceScope = createScope();
  const browserControl = fakeBrowserControl();
  browserControl.executeTool = () => unavailableBrowserCall();
  const mcpServer = createBrowserSessionMcpServer(browserControl, serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const result = CallToolResultSchema.parse(
    await client.callTool({ arguments: {}, name: "browser_snapshot" }),
  );
  expect(result.isError).toBe(true);
  expect(result.content[firstContentIndex]).toMatchObject({
    text: "浏览器尚未就绪。",
  });
  await close();
});

const invalidBrowserToolCalls = [
  {
    arguments: { milliseconds: outOfRangeWaitMilliseconds },
    expectedField: /milliseconds/u,
    name: "browser_wait",
    title: "a wait beyond the public limit",
  },
  {
    arguments: {},
    expectedField: /platformId/u,
    name: "browser_prepare_login",
    title: "a missing required platform",
  },
  {
    arguments: { maximumCards: 101 },
    expectedField: /maximumCards/u,
    name: "browser_job_card_snapshot",
    title: "a job-card limit above the public maximum",
  },
  {
    arguments: { engagement: "contacted" },
    expectedField: /platformId/u,
    name: "browser_sync_job_engagement",
    title: "a job-engagement sync without a platform",
  },
  {
    arguments: { ignored: true },
    expectedField: /ignored/u,
    name: "browser_snapshot",
    title: "an undeclared argument",
  },
  {
    arguments: { userReturnedControl: "yes" },
    expectedField: /userReturnedControl/u,
    name: "browser_snapshot",
    title: "a non-boolean returned-control declaration",
  },
] as const;

test.each(invalidBrowserToolCalls)(
  "rejects $title",
  async ({ arguments: input, expectedField, name }) => {
    await using serviceScope = createScope();
    const mcpServer = createBrowserSessionMcpServer(fakeBrowserControl(), serviceScope);
    const { client, close } = await connectedClient(mcpServer);

    const result = CallToolResultSchema.parse(await client.callTool({ arguments: input, name }));
    expect(result.isError).toBe(true);
    expect(result.content[firstContentIndex]).toMatchObject({
      text: expect.stringMatching(expectedField),
    });
    await close();
  },
);

test("contains contextual browser tool rejections", async () => {
  await using serviceScope = createScope();
  const mcpServer = createBrowserSessionMcpServer(browserToolExecutorControl(), serviceScope);
  const { client, close } = await connectedClient(mcpServer);

  const missingPlatformResult = CallToolResultSchema.parse(
    await client.callTool({ arguments: { action: "ensure" }, name: "browser_tabs" }),
  );
  expect(missingPlatformResult.isError).toBe(true);
  expect(missingPlatformResult.content[firstContentIndex]).toMatchObject({
    text: expect.stringMatching(/platformId/u),
  });

  const expiredReferenceResult = CallToolResultSchema.parse(
    await client.callTool({ arguments: { ref: "e1" }, name: "browser_click" }),
  );
  expect(expiredReferenceResult.isError).toBe(true);
  expect(expiredReferenceResult.content[firstContentIndex]).toMatchObject({
    text: expect.stringMatching(/不存在或已过期/u),
  });

  await close();
});
