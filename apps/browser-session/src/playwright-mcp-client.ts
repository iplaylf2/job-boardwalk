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
const extensionTokenParameter = /(?<prefix>[?&]token=)[^&)\s]+/gu;

export interface McpToolClient {
  callTool: (params: CallToolRequest["params"]) => Promise<CallToolResult>;
  close: () => Promise<void>;
  listTools: () => Promise<ListToolsResult>;
}

function redactText(text: string): string {
  return text.replace(extensionTokenParameter, "$<prefix><redacted>");
}

function redactToolResult(result: CallToolResult): CallToolResult {
  return {
    ...result,
    content: result.content.map((content) =>
      content.type === "text" ? { ...content, text: redactText(content.text) } : content,
    ),
  };
}

export class PlaywrightMcpClient {
  readonly #client: McpToolClient;
  readonly #tools: Tool[];

  private constructor(client: McpToolClient, tools: Tool[]) {
    this.#client = client;
    this.#tools = tools;
  }

  public static *initialize(client: McpToolClient): RiteCoroutine<PlaywrightMcpClient> {
    const { tools } = yield* until(() => client.listTools());
    if (!tools.some((tool) => tool.name === currentPageInitializationRequest.name)) {
      throw new Error("上游 Playwright MCP 未提供 browser_tabs 工具。");
    }
    yield* until(() => client.callTool(currentPageInitializationRequest));
    return new PlaywrightMcpClient(client, tools);
  }

  public get tools(): readonly Tool[] {
    return this.#tools;
  }

  public *callTool(params: CallToolRequest["params"]): RiteCoroutine<CallToolResult> {
    return redactToolResult(yield* until(() => this.#client.callTool(params)));
  }

  public *close(): RiteCoroutine<void> {
    yield* until(() => this.#client.close());
  }
}

export function* connectPlaywrightMcpClient(endpoint: URL): RiteCoroutine<PlaywrightMcpClient> {
  const client = new Client({ name: "job-boardwalk-browser-session", version: "0.1.0" });
  try {
    const transport = new StreamableHTTPClientTransport(endpoint) as unknown as Transport;
    yield* until(() => client.connect(transport));
    return yield* PlaywrightMcpClient.initialize({
      callTool: (params) =>
        client.callTool(params).then((result) => CallToolResultSchema.parse(result)),
      close: () => client.close(),
      listTools: () => client.listTools(),
    });
  } catch (error) {
    yield* until(() => client.close().catch(String));
    throw error;
  }
}
