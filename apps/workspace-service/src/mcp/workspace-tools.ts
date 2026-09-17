import { OperationError } from "@job-boardwalk/contracts";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";
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

export const workspaceOverviewDescription =
  "读取本机工作区概览：各招聘平台最近一次明确的登录状态记录、尚未解决的访问中断、用户的个人条件，以及各求职方向关联的平台研究起点及当前选择状态。";
const jobLibraryToolDescription =
  "分页读取岗位库和职位描述覆盖统计；可按关键词、平台或跟进记录筛选，engagement=tracked 读取有任意跟进记录的岗位。覆盖统计遵循关键词、平台和跟进筛选，不受 descriptionStatus 影响。descriptionStatus=captured 读取已有描述的岗位，missing 读取全部暂无描述的岗位，identity-unresolved 读取暂无描述、且所有来源均缺少平台岗位 ID 和详情页链接的岗位。结果保留各平台来源、原始链接、跟进记录、已采集职位描述及可选的 recruitment 观察。空跟进列表表示未记录；recruitment 缺失或 state=unknown 均不表示招聘中。";
const researchReportListDescription =
  "读取研究报告目录，包含标题、撰写状态、创建和更新时间，以及可选到期时间。默认排除过期报告；includeExpired=true 同时列出过期报告。正文通过 read_research_report 读取。";
const researchReportDetailDescription =
  "按 ID 读取研究报告正文和元数据。默认排除过期报告；includeExpired=true 可读取已过期报告。";
const saveResearchReportDescription =
  "保存 Markdown 研究报告：省略 id 时创建，提供 id 时替换。每次提交 title、markdown、state（draft/complete）及变更归因（initiatedBy、reason），可设置 expiresAt。替换会保留 ID 和创建时间，覆盖标题、正文、撰写状态和到期时间；省略 expiresAt 会清除原到期时间。不保留修订历史。complete 表示撰写完成。";

interface WorkspaceToolDefinition extends Omit<Tool, "inputSchema"> {
  inputSchema: ReturnType<typeof ReadWorkspaceOverviewInput.toJsonSchema>;
  execute: (repository: WorkspaceRepository, input: Record<string, unknown>) => object;
}
const toolDefinitions: WorkspaceToolDefinition[] = [
  {
    annotations: { readOnlyHint: true },
    description: workspaceOverviewDescription,
    execute(repository, input) {
      parseWorkspaceOverviewInput(input);
      return readWorkspaceOverview(repository);
    },
    inputSchema: ReadWorkspaceOverviewInput.toJsonSchema(),
    name: "read_workspace_overview",
    title: "读取 Job Boardwalk 工作区概览",
  },
  {
    annotations: { readOnlyHint: true },
    description: jobLibraryToolDescription,
    execute(repository, input) {
      return repository.listJobPostingPage(parseJobLibraryInput(input));
    },
    inputSchema: ReadJobLibraryInput.toJsonSchema(),
    name: "read_job_library",
    title: "读取 Job Boardwalk 岗位库",
  },
  {
    annotations: { readOnlyHint: true },
    description: researchReportListDescription,
    execute(repository, input) {
      return { reports: repository.listResearchReports(parseListResearchReportsInput(input)) };
    },
    inputSchema: ListResearchReportsInput.toJsonSchema(),
    name: "list_research_reports",
    title: "列出 Job Boardwalk 研究报告",
  },
  {
    annotations: { readOnlyHint: true },
    description: researchReportDetailDescription,
    execute(repository, input) {
      const { id, includeExpired } = parseReadResearchReportInput(input);
      const report = repository.readResearchReport(id, includeExpired);
      if (!report) {
        throw new OperationError("not-found", "找不到研究报告", {
          id,
          resource: "research-report",
        });
      }
      return report;
    },
    inputSchema: ReadResearchReportInput.toJsonSchema(),
    name: "read_research_report",
    title: "读取 Job Boardwalk 研究报告",
  },
  {
    annotations: { destructiveHint: true, readOnlyHint: false },
    description: saveResearchReportDescription,
    execute(repository, input) {
      const command = parseSaveResearchReportInput(input);
      const report = repository.saveResearchReport(command);
      if (!report) {
        throw new OperationError("not-found", "找不到研究报告", {
          resource: "research-report",
          ...(command.id ? { id: command.id } : {}),
        });
      }
      return report;
    },
    inputSchema: SaveResearchReportInput.toJsonSchema(),
    name: "save_research_report",
    title: "保存 Job Boardwalk 研究报告",
  },
];

export const workspaceToolRegistry: ReadonlyMap<string, WorkspaceToolDefinition> = new Map(
  toolDefinitions.map((tool) => [tool.name, tool]),
);
