import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CanceledError, ScopeError } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { platformCatalog, platformIds } from "@job-boardwalk/platform-catalog";

import type { BrowserControl } from "#/browser/browser-control.js";
import {
  browserToolInputContracts,
  isBrowserToolName,
  parseBrowserToolInput,
} from "#/mcp/tool-input.js";
import type { BrowserToolName } from "#/mcp/tool-input.js";

const jsonIndentationSpaces = 2;
const supportedPlatformLabels = platformIds
  .map((platformId) => platformCatalog[platformId].label)
  .join("、");
const browserServerInstructions = [
  `Browser Session 管理可见的 Patchright 浏览器，并通过统一适配器控制 ${supportedPlatformLabels} 标签页。`,
  "访问观察：平台适配器可从顶层导航响应和有界 browser_snapshot 判定其明确支持的证据。browser_snapshot 返回非 null 的 platformAccessObservation 时，结论已加入自动状态上报，调用方不得重复提交；null 表示适配器未能分类，调用方仍需解释有界页面证据。",
  "账号边界：招聘平台的 HTTPS 导航范围只允许研究导航和登录交接准备，不授权登录、验证、投递、消息或账号变更。",
  "用户交接：需要登录、验证或其他用户操作时，使用 browser_prepare_login 准备登录界面后立即停止浏览器输入。只有用户明确交回控制权并重新观察页面后，才能继续。",
  "可见结果：工具返回值不能覆盖用户对当前窗口的观察；两者不一致时，以重新观察和用户可见页面为准。",
].join("\n\n");

function defineBrowserTool(
  definition: Omit<Tool, "inputSchema" | "name"> & { name: BrowserToolName },
): Tool {
  return {
    ...definition,
    inputSchema: browserToolInputContracts[definition.name].toJsonSchema() as Tool["inputSchema"],
  };
}

const browserTools = [
  defineBrowserTool({
    annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: true },
    description: "查看 Browser Session 所管理的可见浏览器状态。",
    name: "browser_status",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "列出或激活受支持招聘平台的标签页，也可按 platformId 准备标签页。action 为 ensure 时优先复用该平台已有标签页。",
    name: "browser_tabs",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "当用户明确要求登录，或可见页面证据表明当前会话未登录且所请求的流程需要登录时，复用该平台标签页并打开登录界面。此工具只准备用户交接；界面打开后立即停止浏览器输入，由用户填写凭据、扫码或输入验证码，并提交登录。",
    name: "browser_prepare_login",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "将现有标签页导航到同一招聘平台内的指定 HTTPS URL。",
    name: "browser_navigate",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "读取有界的可见文本和通用交互元素，并返回短期有效的元素引用。平台适配器会同时判定其明确支持的登录证据，将结论加入 Browser Session 状态上报，并在 platformAccessObservation 中返回；无法确定时该字段为 null。truncated 表示内容被裁剪；快照不包含表单当前值和密码框。",
    name: "browser_snapshot",
  }),
  defineBrowserTool({
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description:
      "读取当前受支持招聘平台页面中已经加载的岗位卡片，返回有界、去重的页面证据供调用方汇总。不会导航、滚动、点击或持久化岗位；同一次页面读取可能刷新平台适配器能够明确判定的访问观察，并将其加入 Browser Session 状态上报。岗位提交不由此工具触发：选中求职方向期间，独立的被动采集流程会定期将所有已打开平台页面中能识别出的岗位卡片提交到 Workspace Service，关联推荐页仅作为研究种子。",
    name: "browser_job_card_snapshot",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: true, openWorldHint: true, readOnlyHint: false },
    description: "点击最近一次快照中的元素引用；显式链接必须属于当前招聘平台的 HTTPS 导航范围。",
    name: "browser_click",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "填写最近一次快照中的文本控件；密码框不进入快照。",
    name: "browser_fill",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "在最近一次快照的选择控件中选择选项。",
    name: "browser_select",
  }),
  defineBrowserTool({
    annotations: { idempotentHint: false, openWorldHint: true, readOnlyHint: true },
    description: "在受支持招聘平台的标签页滚动最多 5000 像素，或滚动到指定元素。",
    name: "browser_scroll",
  }),
  defineBrowserTool({
    annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: true },
    description: "在下一次观察或操作前等待指定时间，最长 10 秒。",
    name: "browser_wait",
  }),
] as const satisfies readonly Tool[];

function toolErrorResult(error: unknown): CallToolResult {
  return {
    content: [{ text: error instanceof Error ? error.message : String(error), type: "text" }],
    isError: true,
  };
}

function* forwardBrowserTool(
  request: CallToolRequest,
  browserControl: BrowserControl,
): RiteCoroutine<CallToolResult> {
  try {
    if (!isBrowserToolName(request.params.name)) {
      throw new Error(`不支持的浏览器工具：${request.params.name}`);
    }
    const input = parseBrowserToolInput(request.params.name, request.params.arguments ?? {});
    const result =
      request.params.name === "browser_status"
        ? browserControl.status
        : yield* browserControl.executeTool(request.params.name, input);
    return {
      content: [{ text: JSON.stringify(result, null, jsonIndentationSpaces), type: "text" }],
      structuredContent: { result },
    };
  } catch (error) {
    if (error instanceof CanceledError || error instanceof ScopeError) {
      throw error;
    }
    return toolErrorResult(error);
  }
}

export function createBrowserSessionMcpServer(
  browserControl: BrowserControl,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk-browser-session", version: "0.1.0" },
    {
      capabilities: { tools: { listChanged: true } },
      instructions: browserServerInstructions,
    },
  );
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    serviceScope.run(function* listBrowserTools() {
      yield* [];
      return { tools: [...browserTools] };
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
    serviceScope.run(() => forwardBrowserTool(request, browserControl)),
  );
  return mcpServer;
}
