// oxlint-disable max-lines -- This module keeps the complete public MCP surface visible together.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { CanceledError, InterruptedError, ScopeError } from "@shajara/host";
import type { Scope } from "@shajara/host";
import { defaultJobPageSize, firstJobPage } from "#/job-posting/library-query.js";
import {
  ListResearchReportsInput,
  parseListResearchReportsInput,
  parseJobLibraryInput,
  parseReadResearchReportInput,
  parseSaveResearchReportInput,
  parseWorkspaceOverviewInput,
  ReadResearchReportInput,
  ReadJobLibraryInput,
  ReadWorkspaceOverviewInput,
  SaveResearchReportInput,
} from "#/mcp/tool-input.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const jobLibraryUri = "job-boardwalk://jobs";
const researchReportsUri = "job-boardwalk://reports";
const workspaceOverviewDescription =
  "读取本机工作区概览：由租约判定的 Browser Session 在线状态、各招聘平台最近一次明确的登录状态记录、尚未解决的访问中断、用户的个人情况，以及带平台推荐页关联和当前选择状态的求职方向。";
const jobLibraryResourceDescription =
  "读取岗位库第一页及分页元数据。岗位来自招聘平台页面，经规范化和跨平台合并；每个平台来源保留发现页面、可选的岗位原始链接，以及个人中心观察到的感兴趣、沟通过、已投递和面试记录。";
const jobLibraryToolDescription =
  "分页读取岗位库，可搜索并按平台或跟进记录筛选。每个平台来源保留发现页面、可选的岗位原始链接，以及个人中心观察到的感兴趣、沟通过、已投递和面试记录。";
const researchReportListDescription =
  "读取未过期的研究报告目录。报告可由用户、agent 或系统写入，以 Markdown 保存，并包含草稿或完成状态与更新时间。";
const researchReportDetailDescription =
  "按 ID 读取一份未过期的研究报告，包括标题、Markdown 正文、状态、创建和更新时间，以及可选的过期时间。";
const saveResearchReportDescription =
  "保存一份 Markdown 研究报告。省略 id 时创建；提供 id 时完整更新对应报告。可设置过期时间。";
const toolNames = {
  listResearchReports: "list_research_reports",
  readJobLibrary: "read_job_library",
  readResearchReport: "read_research_report",
  readWorkspaceOverview: "read_workspace_overview",
  saveResearchReport: "save_research_report",
} as const;

function structuredToolResult(value: object) {
  return {
    content: [{ text: JSON.stringify(value), type: "text" as const }],
    structuredContent: { ...value },
  };
}

function toolErrorResult(error: unknown): CallToolResult {
  if (
    error instanceof CanceledError ||
    error instanceof InterruptedError ||
    error instanceof ScopeError
  ) {
    throw error;
  }
  const message =
    error instanceof TypeError ? error.message : "Workspace Service 无法完成工作区请求。";
  return {
    content: [{ text: message, type: "text" }],
    isError: true,
  };
}

function readResourceValue(
  uri: string,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
): object | null {
  if (uri === workspaceOverviewUri) {
    return readWorkspaceOverview(repository, presenceTracker);
  }
  if (uri === jobLibraryUri) {
    return repository.listJobPostingPage({
      page: firstJobPage,
      pageSize: defaultJobPageSize,
    });
  }
  if (uri === researchReportsUri) {
    return { reports: repository.listResearchReports() };
  }
  return null;
}

function readWorkspaceResource(
  uri: string,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
) {
  return serviceScope
    .run(function* readWorkspaceResourceInScope() {
      try {
        yield* [];
        const value = readResourceValue(uri, repository, presenceTracker);
        if (!value) {
          return {
            kind: "error" as const,
            message: `未知的 Job Boardwalk 资源：${uri}`,
          };
        }
        return {
          kind: "value" as const,
          value: {
            contents: [{ mimeType: "application/json", text: JSON.stringify(value), uri }],
          },
        };
      } catch (error) {
        if (
          error instanceof CanceledError ||
          error instanceof InterruptedError ||
          error instanceof ScopeError
        ) {
          throw error;
        }
        return {
          kind: "error" as const,
          message: "Workspace Service 无法完成资源读取。",
        };
      }
    })
    .then((result) => {
      if (result.kind === "error") {
        throw new Error(result.message);
      }
      return result.value;
    });
}

function registerResourceHandlers(
  mcpServer: McpServer,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
): void {
  mcpServer.server.setRequestHandler(ListResourcesRequestSchema, () =>
    Promise.resolve({
      resources: [
        {
          description: workspaceOverviewDescription,
          mimeType: "application/json",
          name: "workspace-overview",
          title: "Job Boardwalk 工作区概览",
          uri: workspaceOverviewUri,
        },
        {
          description: jobLibraryResourceDescription,
          mimeType: "application/json",
          name: "job-library",
          title: "Job Boardwalk 岗位库",
          uri: jobLibraryUri,
        },
        {
          description: researchReportListDescription,
          mimeType: "application/json",
          name: "research-reports",
          title: "Job Boardwalk 研究报告",
          uri: researchReportsUri,
        },
      ],
    }),
  );
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    readWorkspaceResource(request.params.uri, repository, presenceTracker, serviceScope),
  );
}

function createToolListResult() {
  return {
    tools: [
      {
        annotations: { readOnlyHint: true },
        description: workspaceOverviewDescription,
        inputSchema: ReadWorkspaceOverviewInput.toJsonSchema(),
        name: toolNames.readWorkspaceOverview,
        title: "读取 Job Boardwalk 工作区概览",
      },
      {
        annotations: { readOnlyHint: true },
        description: jobLibraryToolDescription,
        inputSchema: ReadJobLibraryInput.toJsonSchema(),
        name: toolNames.readJobLibrary,
        title: "读取 Job Boardwalk 岗位库",
      },
      {
        annotations: { readOnlyHint: true },
        description: researchReportListDescription,
        inputSchema: ListResearchReportsInput.toJsonSchema(),
        name: toolNames.listResearchReports,
        title: "列出 Job Boardwalk 研究报告",
      },
      {
        annotations: { readOnlyHint: true },
        description: researchReportDetailDescription,
        inputSchema: ReadResearchReportInput.toJsonSchema(),
        name: toolNames.readResearchReport,
        title: "读取 Job Boardwalk 研究报告",
      },
      {
        annotations: { destructiveHint: true, readOnlyHint: false },
        description: saveResearchReportDescription,
        inputSchema: SaveResearchReportInput.toJsonSchema(),
        name: toolNames.saveResearchReport,
        title: "保存 Job Boardwalk 研究报告",
      },
    ],
  };
}

// eslint-disable-next-line max-lines-per-function -- The handler keeps dispatch for the small public tool set together.
function registerToolHandlers(
  mcpServer: McpServer,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve(createToolListResult()),
  );
  // eslint-disable-next-line max-lines-per-function -- One dispatcher contains errors consistently for every tool.
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) => {
    if (request.params.name === toolNames.readWorkspaceOverview) {
      return serviceScope.run(function* readWorkspaceTool() {
        try {
          yield* [];
          parseWorkspaceOverviewInput(request.params.arguments ?? {});
          const overview = readWorkspaceOverview(repository, presenceTracker);
          return structuredToolResult(overview);
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    if (request.params.name === toolNames.readJobLibrary) {
      return serviceScope.run(function* readJobLibrary() {
        try {
          yield* [];
          return structuredToolResult(
            repository.listJobPostingPage(parseJobLibraryInput(request.params.arguments ?? {})),
          );
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    if (request.params.name === toolNames.listResearchReports) {
      return serviceScope.run(function* listResearchReports() {
        try {
          yield* [];
          parseListResearchReportsInput(request.params.arguments ?? {});
          return structuredToolResult({ reports: repository.listResearchReports() });
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    if (request.params.name === toolNames.readResearchReport) {
      return serviceScope.run(function* readResearchReport() {
        try {
          yield* [];
          const { id } = parseReadResearchReportInput(request.params.arguments ?? {});
          const report = repository.readResearchReport(id);
          if (!report) {
            throw new TypeError(`找不到研究报告：${String(id)}`);
          }
          return structuredToolResult(report);
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    if (request.params.name === toolNames.saveResearchReport) {
      return serviceScope.run(function* saveResearchReport() {
        try {
          yield* [];
          const input = parseSaveResearchReportInput(request.params.arguments ?? {});
          const report = repository.saveResearchReport(input);
          if (!report) {
            throw new TypeError(`找不到研究报告：${String(input.id)}`);
          }
          return structuredToolResult(report);
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    return Promise.reject(new Error(`未知 MCP 工具：${request.params.name}`));
  });
}

export function createWorkspaceMcpServer(
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  registerResourceHandlers(mcpServer, repository, presenceTracker, serviceScope);
  registerToolHandlers(mcpServer, repository, presenceTracker, serviceScope);
  return mcpServer;
}
