import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { run } from "@shajara/host";
import { expect, test } from "vitest";

import { PlaywrightMcpClient } from "#/playwright-mcp-client.js";
import type { McpToolClient } from "#/playwright-mcp-client.js";

const firstContentIndex = 0;
const forwardedCallCount = 2;

class FakeMcpToolClient implements McpToolClient {
  public readonly calls: CallToolRequest["params"][] = [];
  public closed = false;
  public tools: ListToolsResult["tools"] = [
    {
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
      content: [
        {
          text: "https://extension.invalid/connect?token=sensitive-value&protocolVersion=2",
          type: "text",
        },
      ],
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

test("initializes the existing tab before forwarding browser actions", () =>
  run(function* initializeExistingTab() {
    const client = new FakeMcpToolClient();
    const playwrightClient = yield* PlaywrightMcpClient.initialize(client);
    expect(client.calls).toEqual([{ arguments: { action: "list" }, name: "browser_tabs" }]);

    const result = yield* playwrightClient.callTool({
      arguments: { url: "https://example.com" },
      name: "browser_navigate",
    });
    expect(client.calls).toHaveLength(forwardedCallCount);
    expect(result.content[firstContentIndex]).toMatchObject({
      text: "https://extension.invalid/connect?token=<redacted>&protocolVersion=2",
    });

    yield* playwrightClient.close();
    expect(client.closed).toBe(true);
  }));

test("rejects an upstream server without tab lifecycle support", () =>
  run(function* rejectMissingTabLifecycle() {
    const client = new FakeMcpToolClient();
    client.tools = [];
    try {
      yield* PlaywrightMcpClient.initialize(client);
      throw new Error("缺少 browser_tabs 时初始化不应成功");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("browser_tabs");
    }
  }));
