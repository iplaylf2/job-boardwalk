import {
  McpError,
  ErrorCode,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { operationErrorResponse } from "@job-boardwalk/contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CanceledError, InterruptedError, ScopeError } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import {
  platformCatalog,
  platformIds,
  platformJobEngagementKinds,
} from "@job-boardwalk/platform-catalog";

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
const engagementCapabilities = platformIds
  .map((platformId) => {
    const {
      label,
      web: { jobEngagement },
    } = platformCatalog[platformId];
    const categories = platformJobEngagementKinds.filter(
      (kind) => jobEngagement.destinations[kind] !== null,
    );
    const continuation = jobEngagement.pagination ? "支持翻页续读" : "不支持翻页续读";
    return `${label}（${platformId}）：${categories.join("、")}；${continuation}。`;
  })
  .join("\n");
const browserServerInstructions = [
  `Browser Session 管理可见浏览器，并通过统一适配器控制 ${supportedPlatformLabels} 标签页。`,
  "访问观察：平台适配器可从顶层导航响应和有界 browser_snapshot 判定其明确支持的证据。browser_snapshot 返回非 null 的 platformAccessObservation 时，结论已加入自动状态上报，无需调用方再次提交；null 表示证据尚未分类。",
  "账号边界：招聘平台的 HTTPS 导航范围用于研究导航和登录交接准备；登录、验证、投递、消息和账号变更由用户控制。",
  "用户交接：需要登录时，使用 browser_prepare_login 检查现有会话并按需准备登录界面。只有 outcome=handoff-ready 才开始交接；此后立即停止浏览器输入，被动页面读取也会保持暂停。登录、验证、投递、消息或账号变更由用户完成。用户明确交还控制权后，在第一次 browser_snapshot 中设置 userReturnedControl=true；普通快照省略该字段。",
  "可见结果：判断以用户看到的当前窗口和重新观察结果为准；工具返回冲突时先重新观察。",
  "工具响应：成功时读取 structuredContent.result；isError=true 时读取 structuredContent.error 的 code、details 和展示用 message。",
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
    description: [
      "当用户要求登录，或可见证据表明当前流程需要认证且会话未登录时，暂停被动页面读取并检查该平台现有标签页。已观察到认证证据时返回 outcome=already-authenticated，无需导航或用户交接。",
      "对可复用登录页逐一进行有界检查，激活已出现可用登录控件的候选。无法读取或尚未分类的其他平台页保持不变；没有可复用登录页时，使用空白页或新标签页打开登录入口。",
      "登录界面就绪时返回 outcome=handoff-ready，开始用户交接。无法确认认证或登录界面就绪时，准备失败并恢复被动读取；候选检查结果记录在 error.details.candidates。",
    ].join("\n\n"),
    name: "browser_prepare_login",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "将现有标签页导航到同一招聘平台内的指定 HTTPS URL。返回 navigation 和 pageInspection；达到 DOMContentLoaded 时 outcome=completed，等待超时时 outcome=timed-out。最终 URL 离开受支持平台时仍返回行动结果与 URL，platformId 和 pageInspection 均为 null，表示未读取该文档。超时后根据页面检查和新的可见页面证据决定下一步。",
    name: "browser_navigate",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: [
      "在有界等待内读取可见文本、通用交互元素及适配器补充的详情入口，返回 documentReadyState 和短期有效的 ref。入口可附带 context，提供所属卡片的可见文字，帮助区分同名岗位；将 ref 传给 browser_click 可操作该入口。引用在全会话范围内失效：任意标签页的新快照、导航或页面控件操作，以及登录准备和跟进同步，都会使旧引用失效。失效后对引用所属的 tabId 重新取快照；动作前会重新核对节点及有界内容。",
      "快照不包含表单当前值和密码框。truncated 表示正文或元素集合被裁剪，或超长链接被省略；名称和 context 另有长度上限，其缩短不设置该标志。读取超时会报告标签页关闭、页面检查超时或已观察到的文档生命周期。platformAccessObservation 非 null 时，结论已加入状态上报；null 表示访问证据尚未分类。",
      "仅在用户明确交还控制权后的第一次快照中设置 userReturnedControl=true，以恢复后台读取并允许后续同步复用该平台标签页。该字段不表示认证成功；普通快照省略它。",
    ].join("\n\n"),
    name: "browser_snapshot",
  }),
  defineBrowserTool({
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description: [
      "读取当前招聘平台集合页中的岗位卡片，个人中心跟进页不在读取范围。waitFor=none 立即读取；waitFor=cards-present 在服务预算内等待可识别卡片，出现即返回。cards-observed 表示已读到卡片；no-cards-observed 表示本次未读到，加载中、空结果与未知布局仍需另行判断。读取失败或观察到 URL 改变时停止。truncated 只说明已加载卡片是否被响应上限裁剪，不表示搜索覆盖范围。",
      "仅按可靠详情身份去重，无链接卡片分别保留。本次读取可能刷新访问观察，但不写入岗位库；被动采集另行观察并提交岗位，Workspace Service 负责来源归并。操作详情入口时使用 browser_snapshot 提供的 ref。",
    ].join("\n\n"),
    name: "browser_job_card_snapshot",
  }),
  defineBrowserTool({
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description: [
      "读取当前详情页的主要职位描述和可识别的岗位字段，以 agent 归因写入 Workspace Service。成功响应的 persistence.outcome 表示观察已被接受并保留；写入失败或工作区返回 stale 时调用失败。description.capturedAt 是采集时间，description.truncated 表示描述被本地长度上限裁剪。本次读取不导航、滚动或点击，排除周边推荐岗位，并可能刷新平台访问观察。",
      "若已独立确认当前页面属于某个工作区来源，且该来源尚无描述、外部岗位 ID 和详情链接，可传其 sourceId 请求显式绑定。sourceBinding.outcome=bound 时返回绑定的 sourceId；not-requested 表示未传 sourceId，本次未建立与指定无链接卡片的关联。",
      "描述采集证明岗位内容；本账户是否已投递需另行核实跟进证据，通用投递按钮不能证明尚未投递。",
    ].join("\n\n"),
    name: "browser_job_description_snapshot",
  }),
  defineBrowserTool({
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description: [
      "仅在用户发起的岗位跟进同步任务中调用。每次打开或复用指定平台标签页，将其前置，读取当前类别的一批岗位证据并写入 Workspace Service。不支持的类别在导航前被拒绝。一次扫描受服务资源预算约束，达到预算时保留部分证据并结束扫描。",
      "complete=true 表示证据覆盖平台可见的类别总数及历史窗口，不代表全部历史；完整的 interested（感兴趣）快照可能移除平台列表中已不存在的本地关系。complete=false 仅表示证据不完整，不保证有下一批。",
      "scan.state=continuable 时，以相同 platformId 和 engagement 再次调用可续读；ended 时，下次从分类入口开始，scan.reason 为 complete、scan-limit、no-cards 或 no-continuation。服务重启会丢弃扫描进度。",
      `当前同步能力：\n${engagementCapabilities}`,
    ].join("\n\n"),
    name: "browser_sync_job_engagement",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: true, openWorldHint: true, readOnlyHint: false },
    description:
      "点击最近一次 browser_snapshot 返回的有效 ref；显式链接必须属于当前招聘平台的 HTTPS 导航范围。点击期间及后续有界观察窗口内收到的弹窗会成为选中标签页，并返回该页摘要；否则返回原页摘要。此等待不保证页面数据就绪，更晚出现的标签页需通过 browser_tabs 检查。操作后全会话引用失效。",
    name: "browser_click",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "使用最近一次 browser_snapshot 的有效 ref 填写文本控件；密码框不进入快照。操作后全会话引用失效。",
    name: "browser_fill",
  }),
  defineBrowserTool({
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "使用最近一次 browser_snapshot 的有效 ref 在选择控件中选择选项。操作后全会话引用失效。",
    name: "browser_select",
  }),
  defineBrowserTool({
    annotations: { idempotentHint: false, openWorldHint: true, readOnlyHint: true },
    description: [
      "滚动一个可见区域以继续阅读：direction=down 向下，up 向上。提供 ref 时选择其最近的可滚动祖先，否则滚动所选标签页的文档；同时提供 tabId 时必须与 ref 属于同一页。文档滚动距离为窗口高度，容器滚动距离为其与窗口相交的高度，且不超过容器自身高度。内层容器到达边界时不会继续滚动父层。",
      "返回目标类型、targetTagName、目标 scrollTop 和窗口 scrollY 的前后值；任一位置变化即为 outcome=moved，否则为 unchanged。两者均不表示列表已穷尽或新岗位已加载，请重新观察卡片。目标区域不可见时，先用 browser_reveal 显示元素，再取新快照继续滚动。操作后全会话引用失效。",
    ].join("\n\n"),
    name: "browser_scroll",
  }),
  defineBrowserTool({
    annotations: { idempotentHint: false, openWorldHint: true, readOnlyHint: true },
    description:
      "将 browser_snapshot 中有效 ref 对应的元素显示到可见区域，返回目标、内层滚动祖先及窗口的前后位置。操作后全会话引用失效。此动作不保证加载新岗位；需要继续阅读时使用 browser_scroll，需要观察岗位出现时使用 browser_job_card_snapshot 的 waitFor=cards-present。",
    name: "browser_reveal",
  }),
] as const satisfies readonly Tool[];

function toolErrorResult(error: unknown): CallToolResult {
  const failure = operationErrorResponse(error);
  return {
    content: [{ text: JSON.stringify(failure), type: "text" }],
    isError: true,
    structuredContent: { ...failure },
  };
}

function* forwardBrowserTool(
  request: CallToolRequest,
  browserControl: BrowserControl,
  toolName: BrowserToolName,
): RiteCoroutine<CallToolResult> {
  try {
    const input = parseBrowserToolInput(toolName, request.params.arguments ?? {});
    const result =
      toolName === "browser_status"
        ? browserControl.status
        : yield* browserControl.executeTool(toolName, input);
    return {
      content: [{ text: JSON.stringify({ result }, null, jsonIndentationSpaces), type: "text" }],
      structuredContent: { result },
    };
  } catch (error) {
    if (
      error instanceof CanceledError ||
      error instanceof InterruptedError ||
      error instanceof ScopeError
    ) {
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
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) => {
    const toolName = request.params.name;
    if (!isBrowserToolName(toolName)) {
      return Promise.reject(
        new McpError(ErrorCode.InvalidParams, "未知 MCP 工具", { tool: toolName }),
      );
    }
    return serviceScope.run(() => forwardBrowserTool(request, browserControl, toolName));
  });
  return mcpServer;
}
