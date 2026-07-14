import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { completer, run } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { poll } from "@shajara/host/primitives";
import { expect, test } from "vitest";

import { PlaywrightMcpClient } from "#/playwright-mcp-client.js";
import type { McpToolClient } from "#/playwright-mcp-client.js";

const firstContentIndex = 0;
const firstToolIndex = 0;
const forwardedCallCount = 2;
const resourceLinkContentIndex = 1;

class FakeMcpToolClient implements McpToolClient {
  public readonly calls: CallToolRequest["params"][] = [];
  public closed = false;
  public tools: ListToolsResult["tools"] = [
    {
      description: "Open https://extension.invalid/connect?token=tool-secret",
      inputSchema: {
        properties: { action: { type: "string" } },
        type: "object",
      },
      name: "browser_tabs",
    },
    {
      inputSchema: { properties: { url: { type: "string" } }, type: "object" },
      name: "browser_navigate",
    },
  ];

  public callTool(params: CallToolRequest["params"]): Promise<CallToolResult> {
    this.calls.push(params);
    return Promise.resolve({
      _meta: {
        extensionUrl: "https://extension.invalid/connect?token=sensitive-value",
      },
      content: [
        {
          text: "https://extension.invalid/connect?token=sensitive-value&protocolVersion=2",
          type: "text",
        },
        {
          name: "extension connection",
          type: "resource_link",
          uri: "https://extension.invalid/connect?token=sensitive-value",
        },
      ],
      structuredContent: {
        extensionUrl: "https://extension.invalid/connect?token=sensitive-value&protocolVersion=2",
      },
    });
  }

  public close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  public listTools(): Promise<ListToolsResult> {
    return Promise.resolve({ tools: this.tools });
  }
}

function* initializeClient(
  client: McpToolClient,
  reservedToolNames: readonly string[] = [],
): RiteCoroutine<PlaywrightMcpClient> {
  const disconnected = yield* completer<Error>();
  return yield* PlaywrightMcpClient.initialize(
    client,
    { disconnected: disconnected.future, markDisconnected: disconnected.resolve },
    reservedToolNames,
  );
}

test("initializes the existing tab before forwarding browser actions", () =>
  run(function* initializeExistingTab() {
    const client = new FakeMcpToolClient();
    const playwrightClient = yield* initializeClient(client);
    expect(client.calls).toEqual([{ arguments: { action: "list" }, name: "browser_tabs" }]);
    expect(playwrightClient.tools[firstToolIndex]?.description).toBe(
      "Open https://extension.invalid/connect?token=<redacted>",
    );

    const result = yield* playwrightClient.callTool({
      arguments: { url: "https://example.com" },
      name: "browser_navigate",
    });
    expect(client.calls).toHaveLength(forwardedCallCount);
    expect(result.content[firstContentIndex]).toMatchObject({
      text: "https://extension.invalid/connect?token=<redacted>&protocolVersion=2",
    });
    expect(result.content[resourceLinkContentIndex]).toMatchObject({
      uri: "https://extension.invalid/connect?token=<redacted>",
    });
    expect(result.structuredContent).toEqual({
      extensionUrl: "https://extension.invalid/connect?token=<redacted>&protocolVersion=2",
    });
    expect(result["_meta"]).toEqual({
      extensionUrl: "https://extension.invalid/connect?token=<redacted>",
    });

    yield* playwrightClient.close();
    expect(client.closed).toBe(true);
  }));

test("rejects a failed current-tab initialization without exposing an extension token", () =>
  run(function* rejectFailedInitialization() {
    const client = new FakeMcpToolClient();
    client.callTool = () =>
      Promise.resolve({
        content: [
          {
            text: "failed at https://extension.invalid/connect?token=sensitive-value",
            type: "text",
          },
        ],
        isError: true,
      });
    try {
      yield* initializeClient(client);
      throw new Error("当前标签页初始化失败时不应继续启动");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("token=<redacted>");
      expect((error as Error).message).not.toContain("sensitive-value");
    }
  }));

test("rejects an upstream tool name reserved by Browser Session", () =>
  run(function* rejectReservedToolName() {
    const client = new FakeMcpToolClient();
    client.tools = [
      {
        inputSchema: { properties: {}, type: "object" },
        name: "browser_observe_platform_access",
      },
    ];
    try {
      yield* initializeClient(client, ["browser_observe_platform_access"]);
      throw new Error("上游工具不应覆盖 Browser Session 工具");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("工具名");
    }
  }));

test("redacts an extension token from a rejected upstream call", () =>
  run(function* redactRejectedCall() {
    const client = new FakeMcpToolClient();
    const playwrightClient = yield* initializeClient(client);
    client.callTool = () =>
      Promise.reject(new Error("closed https://extension.invalid/connect?token=sensitive-value"));
    try {
      yield* playwrightClient.callTool({ name: "browser_navigate" });
      throw new Error("上游拒绝不应被当成成功");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("token=<redacted>");
      expect((error as Error).message).not.toContain("sensitive-value");
      expect(yield* poll(playwrightClient.disconnected)).toEqual([false]);
    }
  }));

test("marks only an explicit connection closure as disconnected", () =>
  run(function* markClosedConnection() {
    const client = new FakeMcpToolClient();
    const disconnected = yield* completer<Error>();
    let markedDisconnected = false;
    const playwrightClient = yield* PlaywrightMcpClient.initialize(client, {
      disconnected: disconnected.future,
      markDisconnected: (error) => {
        markedDisconnected = true;
        disconnected.resolve(error);
      },
    });
    client.callTool = () => Promise.reject(new McpError(ErrorCode.ConnectionClosed, "closed"));
    try {
      yield* playwrightClient.callTool({ name: "browser_navigate" });
      throw new Error("连接关闭不应被当成成功");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("McpError");
      expect(markedDisconnected).toBe(true);
    }
  }));

test("rejects an upstream server without tab lifecycle support", () =>
  run(function* rejectMissingTabLifecycle() {
    const client = new FakeMcpToolClient();
    client.tools = [];
    try {
      yield* initializeClient(client);
      throw new Error("缺少 browser_tabs 时初始化不应成功");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("browser_tabs");
    }
  }));
