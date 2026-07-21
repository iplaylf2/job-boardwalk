import { WorkspaceJobEngagementWriter } from "./job-engagement-writer.js";
import { WorkspaceJobPostingWriter } from "./job-posting-writer.js";
import { WorkspaceSelectedJobSearchIntentReader } from "./selected-job-search-intent-reader.js";

export function createWorkspaceServiceClients(workspaceServiceUrl: URL): {
  jobEngagementWriter: WorkspaceJobEngagementWriter;
  jobPostingWriter: WorkspaceJobPostingWriter;
  selectedIntentReader: WorkspaceSelectedJobSearchIntentReader;
} {
  return {
    jobEngagementWriter: new WorkspaceJobEngagementWriter(workspaceServiceUrl),
    jobPostingWriter: new WorkspaceJobPostingWriter(workspaceServiceUrl),
    selectedIntentReader: new WorkspaceSelectedJobSearchIntentReader(workspaceServiceUrl),
  };
}
