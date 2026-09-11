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
  "读取岗位库第一页、职位描述覆盖统计和分页信息。岗位经规范化并在证据充分时跨平台合并；结果保留各平台来源、原始链接、跟进记录和已采集职位描述。";
const jobLibraryToolDescription =
  "分页读取岗位库和职位描述覆盖统计；可按关键词、平台或跟进记录筛选，也可读取全部跟进岗位。descriptionStatus=captured 读取已有描述的岗位，missing 读取全部暂无描述的岗位，identity-unresolved 进一步限定为缺少平台岗位 ID 和详情页链接的暂无描述岗位。结果保留各平台来源、原始链接、跟进记录和已采集职位描述。";
const researchReportListDescription =
  "读取研究报告目录和平台目标进度，默认排除过期报告。可按 sourceId 或 disposition 筛选；同时提供时，两者必须匹配同一条来源结论。查询某来源的留存推荐记录时，传 sourceId、disposition=recommended 和 includeExpired=true，以包含过期报告。报告被替换或删除后，旧结论不再保留。";
const researchReportDetailDescription =
  "按 ID 读取研究报告，包括正文、来源结论及其依据和判断时间、平台目标与进度。默认排除过期报告；历史核验可传 includeExpired=true。";
const saveResearchReportDescription =
  "保存一份 Markdown 研究报告。省略 id 时创建；提供 id 时完整替换对应报告，包括正文、entries 和 targets。可设置过期时间。entries 必须记录 sourceId、recommended/pending/excluded 结论、basis 与 assessedAt；没有结构化结论时传空数组。targets 记录各平台目标数量与可选 nextStep，没有目标时传空数组。每个平台的进度分别统计 recommended、pending 和 excluded 来源，只有 recommended 计入目标完成数量。complete 表示报告撰写完成，仍可有目标缺口。";
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
