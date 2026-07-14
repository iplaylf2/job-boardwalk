import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { completer, until } from "@shajara/host";
import type { RiteCoroutine, RiteFuture } from "@shajara/host";

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

export function redactPlaywrightError(error: unknown): Error {
  const source = error instanceof Error ? error : new Error(String(error));
  const redacted = new Error(redactText(source.message));
  redacted.name = source.name;
  if (source.stack) {
    redacted.stack = redactText(source.stack);
  }
  return redacted;
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
  readonly #disconnected: RiteFuture<Error>;
  readonly #markDisconnected: (error: Error) => void;
  readonly #tools: Tool[];

  private constructor(
    client: McpToolClient,
    tools: Tool[],
    disconnected: RiteFuture<Error>,
    markDisconnected: (error: Error) => void,
  ) {
    this.#client = client;
    this.#disconnected = disconnected;
    this.#markDisconnected = markDisconnected;
    this.#tools = tools;
  }

  public static *initialize(
    client: McpToolClient,
    lifecycle: {
      disconnected: RiteFuture<Error>;
      markDisconnected: (error: Error) => void;
    },
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
      return new PlaywrightMcpClient(
        client,
        tools,
        lifecycle.disconnected,
        lifecycle.markDisconnected,
      );
    } catch (error) {
      throw redactPlaywrightError(error);
    }
  }

  public get tools(): readonly Tool[] {
    return this.#tools;
  }

  public get disconnected(): RiteFuture<Error> {
    return this.#disconnected;
  }

  public *callTool(params: CallToolRequest["params"]): RiteCoroutine<CallToolResult> {
    try {
      return redactToolResult(yield* until(() => this.#client.callTool(params)));
    } catch (error) {
      const redacted = redactPlaywrightError(error);
      if (error instanceof McpError && error.code === ErrorCode.ConnectionClosed) {
        this.#markDisconnected(redacted);
      }
      throw redacted;
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
  const disconnected = yield* completer<Error>();
  function markDisconnected(error: Error): void {
    disconnected.resolve(redactPlaywrightError(error));
  }
  client.onclose = () => markDisconnected(new Error("上游 Playwright MCP 连接已关闭。"));
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
      { disconnected: disconnected.future, markDisconnected },
      reservedToolNames,
    );
  } catch (error) {
    yield* until(() => client.close().catch(String));
    throw redactPlaywrightError(error);
  }
}
