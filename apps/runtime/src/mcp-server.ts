import { type } from "arktype";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type {
  BrowserAvailability,
  BrowserHandoff,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";
import { platformIds } from "@job-boardwalk/platform-catalog";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const runtimeOrigin = process.env["JOB_BOARDWALK_RUNTIME_ORIGIN"] ?? "http://127.0.0.1:54310";
const toolNames = {
  handoffPlatformBrowser: "handoff_platform_browser",
  readBrowserAvailability: "read_browser_availability",
  readWorkspaceOverview: "read_workspace_overview",
} as const;
const browserHandoffInput = type({
  platformId: type.enumerated(...platformIds),
  "purpose?": type.enumerated("browse", "login"),
});

async function requestRuntimeApi<Result>(pathname: string, init?: RequestInit): Promise<Result> {
  const response = await fetch(new URL(pathname, runtimeOrigin), init);
  if (!response.ok) {
    throw new Error(`Job Boardwalk Runtime 请求失败：${response.status}`);
  }
  return (await response.json()) as Result;
}

const mcpServer = new Server(
  { name: "job-boardwalk", version: "0.1.0" },
  { capabilities: { resources: {}, tools: {} } },
);

mcpServer.setRequestHandler(ListResourcesRequestSchema, () =>
  Promise.resolve({
    resources: [
      {
        description: "本地保存的平台访问状态、求职资料、研究意图和目标地点。",
        mimeType: "application/json",
        name: "workspace-overview",
        title: "Job Boardwalk 工作区概览",
        uri: workspaceOverviewUri,
      },
    ],
  }),
);

mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri !== workspaceOverviewUri) {
    throw new Error("未知的 Job Boardwalk 资源");
  }
  const overview = await requestRuntimeApi<WorkspaceOverview>("/api/workspace/overview");
  return {
    contents: [
      { mimeType: "application/json", text: JSON.stringify(overview), uri: workspaceOverviewUri },
    ],
  };
});

mcpServer.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: [
      {
        annotations: { readOnlyHint: true },
        description: "读取本地招聘工作区概览，用于持续研究、信息整合和分析。",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" },
        name: toolNames.readWorkspaceOverview,
        title: "读取招聘工作区概览",
      },
      {
        annotations: { readOnlyHint: true },
        description: "读取 Runtime 中受管理 Chromium 浏览器的可用状态。",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" },
        name: toolNames.readBrowserAvailability,
        title: "读取浏览器可用性",
      },
      {
        annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
        description:
          "打开或聚焦可见的招聘平台窗口，供用户登录、完成验证或查看平台；此工具不执行账号操作。",
        inputSchema: browserHandoffInput.toJsonSchema(),
        name: toolNames.handoffPlatformBrowser,
        title: "打开招聘平台窗口",
      },
    ],
  }),
);

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === toolNames.readWorkspaceOverview) {
    const overview = await requestRuntimeApi<WorkspaceOverview>("/api/workspace/overview");
    return {
      content: [{ text: JSON.stringify(overview), type: "text" }],
      structuredContent: { ...overview },
    };
  }
  if (request.params.name === toolNames.readBrowserAvailability) {
    const availability = await requestRuntimeApi<BrowserAvailability>("/api/browser/availability");
    return {
      content: [{ text: JSON.stringify(availability), type: "text" }],
      structuredContent: { ...availability },
    };
  }
  if (request.params.name === toolNames.handoffPlatformBrowser) {
    const input = browserHandoffInput(request.params.arguments ?? {});
    if (input instanceof type.errors) {
      throw new TypeError(input.summary);
    }
    const purpose = input.purpose ?? "browse";
    const handoff = await requestRuntimeApi<BrowserHandoff>(
      `/api/platforms/${input.platformId}/browser-handoff?purpose=${purpose}`,
      { method: "POST" },
    );
    return {
      content: [{ text: handoff.message, type: "text" }],
      structuredContent: { ...handoff },
    };
  }
  throw new Error(`未知 MCP 工具：${request.params.name}`);
});

await mcpServer.connect(new StdioServerTransport());
