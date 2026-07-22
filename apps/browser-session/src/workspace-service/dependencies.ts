import { WorkspaceJobEngagementWriter } from "./job-engagement-writer.js";
import { WorkspaceJobPostingWriter } from "./job-posting-writer.js";

export function createWorkspaceServiceClients(workspaceServiceUrl: URL): {
  jobEngagementWriter: WorkspaceJobEngagementWriter;
  jobPostingWriter: WorkspaceJobPostingWriter;
} {
  return {
    jobEngagementWriter: new WorkspaceJobEngagementWriter(workspaceServiceUrl),
    jobPostingWriter: new WorkspaceJobPostingWriter(workspaceServiceUrl),
  };
}
