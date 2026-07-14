import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const currentPageInitializationRequest = {
  arguments: { action: "list" },
  name: "browser_tabs",
} as const;
const extensionTokenParameter = /(?<prefix>[?&]token=)[^&#\s"'<>]+/giu;

export interface McpToolClient {
  callTool: (params: CallToolRequest["params"]) => Promise<CallToolResult>;
  close: () => Promise<void>;
  listTools: () => Promise<ListToolsResult>;
}

function redactText(text: string): string {
  return text.replace(extensionTokenParameter, "$<prefix><redacted>");
}

function redactError(error: unknown): Error {
  return new Error(redactText(error instanceof Error ? error.message : String(error)));
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, redactValue(nestedValue)]),
    );
  }
  return value;
}

function redactToolResult(result: CallToolResult): CallToolResult {
  return redactValue(result) as CallToolResult;
}

export class PlaywrightMcpClient {
  readonly #client: McpToolClient;
  readonly #tools: Tool[];

  private constructor(client: McpToolClient, tools: Tool[]) {
    this.#client = client;
    this.#tools = tools;
  }

  public static *initialize(
    client: McpToolClient,
    reservedToolNames: readonly string[] = [],
  ): RiteCoroutine<PlaywrightMcpClient> {
    try {
      const listedTools = yield* until(() => client.listTools());
      const tools = redactValue(listedTools.tools) as Tool[];
      const conflictingTool = tools.find(({ name }) => reservedToolNames.includes(name));
      if (conflictingTool) {
        throw new Error(
          `上游 Playwright MCP 工具名与 Browser Session 冲突：${conflictingTool.name}`,
        );
      }
      if (!tools.some((tool) => tool.name === currentPageInitializationRequest.name)) {
        throw new Error("上游 Playwright MCP 未提供 browser_tabs 工具。");
      }
      const initializationResult = redactToolResult(
        yield* until(() => client.callTool(currentPageInitializationRequest)),
      );
      if (initializationResult.isError) {
        const detail = initializationResult.content
          .filter(
            (
              content,
            ): content is Extract<
              (typeof initializationResult.content)[number],
              { type: "text" }
            > => content.type === "text",
          )
          .map(({ text }) => text)
          .join("\n");
        throw new Error(`上游 Playwright MCP 无法初始化当前标签页${detail ? `：${detail}` : "。"}`);
      }
      return new PlaywrightMcpClient(client, tools);
    } catch (error) {
      throw redactError(error);
    }
  }

  public get tools(): readonly Tool[] {
    return this.#tools;
  }

  public *callTool(params: CallToolRequest["params"]): RiteCoroutine<CallToolResult> {
    try {
      return redactToolResult(yield* until(() => this.#client.callTool(params)));
    } catch (error) {
      throw redactError(error);
    }
  }

  public *close(): RiteCoroutine<void> {
    yield* until(() => this.#client.close());
  }
}

export function* connectPlaywrightMcpClient(
  endpoint: URL,
  reservedToolNames: readonly string[] = [],
): RiteCoroutine<PlaywrightMcpClient> {
  const client = new Client({ name: "job-boardwalk-browser-session", version: "0.1.0" });
  try {
    const transport = new StreamableHTTPClientTransport(endpoint) as unknown as Transport;
    yield* until(() => client.connect(transport));
    return yield* PlaywrightMcpClient.initialize(
      {
        callTool: (params) =>
          client.callTool(params).then((result) => CallToolResultSchema.parse(redactValue(result))),
        close: () => client.close(),
        listTools: () => client.listTools(),
      },
      reservedToolNames,
    );
  } catch (error) {
    yield* until(() => client.close().catch(String));
    throw redactError(error);
  }
}
