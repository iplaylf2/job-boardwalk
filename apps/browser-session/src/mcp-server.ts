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
  `Browser Session 管理可见浏览器，并通过统一适配器控制 ${supportedPlatformLabels} 标签页。`,
  "访问观察：平台适配器可从顶层导航响应和有界 browser_snapshot 判定其明确支持的证据。browser_snapshot 返回非 null 的 platformAccessObservation 时，结论已加入自动状态上报，无需调用方再次提交；null 表示证据尚未分类。",
  "账号边界：招聘平台的 HTTPS 导航范围用于研究导航和登录交接准备；登录、验证、投递、消息和账号变更由用户控制。",
  "用户交接：需要登录时，使用 browser_prepare_login 检查现有会话并按需准备登录界面。只有 outcome=handoff-ready 才开始交接；此后立即停止浏览器输入，被动页面读取也会保持暂停。登录、验证、投递、消息或账号变更由用户完成。用户明确交还控制权后，在第一次 browser_snapshot 中设置 userReturnedControl=true；普通快照省略该字段。",
  "可见结果：判断以用户看到的当前窗口和重新观察结果为准；工具返回冲突时先重新观察。",
  "故障分类：browser_status 的 available=false 表示浏览器运行时整体不可用。navigation.outcome=timed-out 只表示目标页未在时限内达到 DOMContentLoaded；pageInspection 分别报告页面关闭、检查超时或观察到的文档生命周期。验证和拒绝访问仍须由可见控件或页面语义确定。",
  "恢复边界：重复超时仍不能确定原因；超时本身不会触发自动重试、刷新、换页或重启。先重新观察；仍无法读取时，询问用户可见窗口显示了什么，再决定有界的下一步。",
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
      "列出或激活受支持招聘平台的标签页，也可按 platformId 准备标签页。action 为 ensure 时优先复用该平台已有标签页。list 返回每页有界的 pageInspection，每页检查均有独立等待上限。",
    name: "browser_tabs",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "当用户明确要求登录，或可见证据表明当前流程需要认证且会话未登录时，暂停被动页面读取并检查该平台现有标签页。已观察到认证证据时返回 outcome=already-authenticated，不导航或交出控制权。否则保留所有已成功读取且仍位于平台登录路由的标签页作为候选，逐一进行有界检查，并只激活已出现可用登录控件的候选。无法读取或尚未分类的其他平台页保持不变，以免覆盖可能的验证或访问决定；没有可复用登录页时，改用空白页或新标签页打开登录入口并有界观察。登录页出现启用的用户控件时返回 outcome=handoff-ready，开始用户交接；无法建立任一结果时准备失败并恢复被动读取。",
    name: "browser_prepare_login",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "将现有标签页导航到同一招聘平台内的指定 HTTPS URL。返回 navigation 和 pageInspection；达到 DOMContentLoaded 时 outcome=completed，等待超时时 outcome=timed-out。超时后根据页面检查和新的可见页面证据决定下一步。",
    name: "browser_navigate",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "在有界等待内读取可见文本和通用交互元素，并返回 documentReadyState 与短期有效的元素引用；truncated 表示内容被裁剪，快照不包含表单当前值和密码框。正文读取超时时会报告标签页关闭、页面检查超时或已观察到的文档生命周期，后续操作以新的显式观察为依据。平台适配器会同时判定其明确支持的登录证据，将结论加入 Browser Session 状态上报，并在 platformAccessObservation 中返回；无法分类时该字段为 null。userReturnedControl 只用于用户明确交还控制权后的第一次快照：它恢复后台页面读取，并允许后续显式岗位跟进同步复用该平台原标签页。该字段记录控制权已归还；认证状态由随后取得的页面证据判定。普通快照省略该字段。",
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
      "读取当前招聘平台标签页中已加载的岗位卡片，返回有界、去重的页面证据；个人中心岗位跟进页面不属于此工具的读取范围，调用会失败。此工具不会导航、滚动、点击或持久化岗位，但同一次读取可能刷新平台适配器能够明确判定的访问观察，并将其加入 Browser Session 状态上报。独立的被动采集流程会定期提交所有已打开合格页面中的岗位卡片，但不会为当前求职方向自动打开或导航研究页面。",
    name: "browser_job_card_snapshot",
  }),
  defineBrowserTool({
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description:
      "读取当前岗位详情页的职位描述正文和可识别的标题、公司、地点、薪资等字段，并将观察写入 Workspace Service。若已确认某个工作区来源尚无已采集详情、外部岗位 ID 和详情链接，且当前页面属于该来源，可传入其 sourceId；服务会校验后显式绑定，未传入时不会猜测合并。仅在观察被接受并保留后返回；写入失败或结果为 `stale` 时调用失败。不会导航、滚动或点击，也不会把周边推荐岗位当作当前岗位；同一次读取可能刷新平台访问观察。",
    name: "browser_job_description_snapshot",
  }),
  defineBrowserTool({
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description:
      "仅在用户发起的岗位跟进同步任务中调用。BOSS直聘、鱼泡直聘支持四类同步；51job 支持收藏、投递和面试邀请，不支持已沟通。51job 每次只读取当前分类页已加载的链接岗位，不提供翻页续读，面试邀请有岗位时返回部分证据。每次调用打开或复用指定平台标签页，将其前置，读取当前类别的一批岗位证据并写入 Workspace Service。若平台支持继续读取且返回 complete=false，请先检查可见页面，再以同一平台和类别调用；当前扫描最多累计 60 个不同岗位。complete=false 表示证据不完整，不得视为平台完整历史。complete=true 的感兴趣快照可能移除平台列表中已不存在的本地关系。",
    name: "browser_sync_job_engagement",
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
