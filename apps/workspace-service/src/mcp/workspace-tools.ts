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
const jobLibraryToolDescription = [
  "分页读取岗位库。支持关键词、平台、跟进关系和描述状态筛选；externalJobId 必须与 platformId 一起使用，按平台岗位 ID 精确匹配。平台、ID 和跟进条件约束同一来源，返回的岗位仍保留其全部来源。engagement=tracked 表示有任意跟进关系。",
  "descriptionCoverage 统计当前关键词、平台、ID 和跟进条件下的描述覆盖，不受 descriptionStatus 影响。descriptionStatus=captured 返回已有描述的岗位；missing 返回全部无描述岗位；identity-unresolved 返回无描述且所有来源均无平台岗位 ID 或详情链接的岗位。",
  "来源包含身份、链接、跟进关系、已采集描述及可选的 recruitment 观察。空跟进列表表示未记录；recruitment 缺失或 state=unknown 表示没有确定的招聘状态。",
].join("\n\n");
const researchReportListDescription =
  "列出所有已保存研究报告的 ID、标题、创建时间和更新时间，按更新时间从新到旧排列。正文通过 read_research_report 读取。";
const researchReportDetailDescription =
  "按 ID 读取研究报告，包含标题、Markdown 正文、创建时间和更新时间。";
const saveResearchReportDescription =
  "保存 Markdown 研究报告：省略 id 时创建，提供 id 时替换已有报告。每次提交完整的 title、markdown 及变更归因（initiatedBy、reason）。替换保留 ID 和创建时间，覆盖标题和正文，并更新修改时间；不保留修订历史。指定的 id 不存在时报错。";

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
      parseListResearchReportsInput(input);
      return { reports: repository.listResearchReports() };
    },
    inputSchema: ListResearchReportsInput.toJsonSchema(),
    name: "list_research_reports",
    title: "列出 Job Boardwalk 研究报告",
  },
  {
    annotations: { readOnlyHint: true },
    description: researchReportDetailDescription,
    execute(repository, input) {
      const { id } = parseReadResearchReportInput(input);
      const report = repository.readResearchReport(id);
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
