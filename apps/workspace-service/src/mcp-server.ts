import {
  McpError,
  ErrorCode,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { OperationError, operationErrorResponse } from "@job-boardwalk/contracts";
// oxlint-disable max-lines -- This module keeps the complete public MCP surface visible together.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { CanceledError, InterruptedError, ScopeError } from "@shajara/host";
import type { Scope } from "@shajara/host";
import { defaultJobPageSize, firstJobPage } from "#/job-library/query.js";
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
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const jobLibraryUri = "job-boardwalk://jobs";
const researchReportsUri = "job-boardwalk://reports";
const workspaceOverviewDescription =
  "读取本机工作区概览：各招聘平台最近一次明确的登录状态记录、尚未解决的访问中断、用户的个人条件，以及带平台推荐页关联和当前选择状态的求职方向。";
const jobLibraryResourceDescription =
  "读取岗位库第一页、职位描述覆盖统计和分页信息。岗位经规范化并在证据充分时跨平台合并；结果保留各平台来源、原始链接、跟进记录、已采集职位描述及可选的 recruitment 观察。";
const jobLibraryToolDescription =
  "分页读取岗位库和职位描述覆盖统计；可按关键词、平台或跟进记录筛选，也可读取全部跟进岗位。descriptionStatus=captured 读取已有描述的岗位，missing 读取全部暂无描述的岗位，identity-unresolved 进一步限定为缺少平台岗位 ID 和详情页链接的暂无描述岗位。结果保留各平台来源、原始链接、跟进记录、已采集职位描述及可选的 recruitment 观察。空跟进列表表示未记录；recruitment 缺失或 state=unknown 均不表示招聘中。";
const researchReportsResourceDescription =
  "读取未过期研究报告目录，包含标题、撰写状态和时间。查阅过期报告时，使用 list_research_reports。";
const researchReportListDescription =
  "读取研究报告目录，包含标题、撰写状态、创建和更新时间，以及可选到期时间。默认排除过期报告；includeExpired=true 同时列出过期报告。正文通过 read_research_report 读取。";
const researchReportDetailDescription =
  "按 ID 读取研究报告正文和元数据。默认排除过期报告；includeExpired=true 可读取已过期报告。";
const saveResearchReportDescription =
  "保存 Markdown 研究报告：省略 id 时创建，提供 id 时替换。每次提交 title、markdown、state（draft/complete）及变更归因（initiatedBy、reason），可设置 expiresAt。替换会保留 ID 和创建时间，覆盖标题、正文、撰写状态和到期时间；省略 expiresAt 会清除原到期时间。不保留修订历史。complete 表示撰写完成。";
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
  const failure = operationErrorResponse(error);
  return {
    content: [{ text: JSON.stringify(failure), type: "text" }],
    isError: true,
    structuredContent: { ...failure },
  };
}

function readResourceValue(uri: string, repository: WorkspaceRepository): object | null {
  if (uri === workspaceOverviewUri) {
    return readWorkspaceOverview(repository);
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

function readWorkspaceResource(uri: string, repository: WorkspaceRepository, serviceScope: Scope) {
  return serviceScope
    .run(function* readWorkspaceResourceInScope() {
      try {
        yield* [];
        const value = readResourceValue(uri, repository);
        if (!value) {
          return {
            code: -32_002,
            data: { uri },
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
          code: ErrorCode.InternalError,
          data: operationErrorResponse(error),
          kind: "error" as const,
          message: "Workspace Service 无法完成资源读取。",
        };
      }
    })
    .then((result) => {
      if (result.kind === "error") {
        throw new McpError(result.code, result.message, result.data);
      }
      return result.value;
    });
}

function registerResourceHandlers(
  mcpServer: McpServer,
  repository: WorkspaceRepository,
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
          description: researchReportsResourceDescription,
          mimeType: "application/json",
          name: "research-reports",
          title: "Job Boardwalk 研究报告",
          uri: researchReportsUri,
        },
      ],
    }),
  );
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    readWorkspaceResource(request.params.uri, repository, serviceScope),
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
          const overview = readWorkspaceOverview(repository);
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
          const filter = parseListResearchReportsInput(request.params.arguments ?? {});
          return structuredToolResult({ reports: repository.listResearchReports(filter) });
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    if (request.params.name === toolNames.readResearchReport) {
      return serviceScope.run(function* readResearchReport() {
        try {
          yield* [];
          const { id, includeExpired } = parseReadResearchReportInput(
            request.params.arguments ?? {},
          );
          const report = repository.readResearchReport(id, includeExpired);
          if (!report) {
            throw new OperationError("not-found", "找不到研究报告", {
              id,
              resource: "research-report",
            });
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
            throw new OperationError("not-found", "找不到研究报告", {
              resource: "research-report",
              ...(input.id ? { id: input.id } : {}),
            });
          }
          return structuredToolResult(report);
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    return Promise.reject(
      new McpError(ErrorCode.InvalidParams, "未知 MCP 工具", { tool: request.params.name }),
    );
  });
}

export function createWorkspaceMcpServer(
  repository: WorkspaceRepository,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  registerResourceHandlers(mcpServer, repository, serviceScope);
  registerToolHandlers(mcpServer, repository, serviceScope);
  return mcpServer;
}
