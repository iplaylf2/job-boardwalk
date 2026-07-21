import { WorkspaceJobInterestWriter } from "./job-interest-writer.js";
import { WorkspaceJobPostingWriter } from "./job-posting-writer.js";
import { WorkspaceSelectedJobSearchIntentReader } from "./selected-job-search-intent-reader.js";

export function createWorkspaceServiceClients(workspaceServiceUrl: URL): {
  jobInterestWriter: WorkspaceJobInterestWriter;
  jobPostingWriter: WorkspaceJobPostingWriter;
  selectedIntentReader: WorkspaceSelectedJobSearchIntentReader;
} {
  return {
    jobInterestWriter: new WorkspaceJobInterestWriter(workspaceServiceUrl),
    jobPostingWriter: new WorkspaceJobPostingWriter(workspaceServiceUrl),
    selectedIntentReader: new WorkspaceSelectedJobSearchIntentReader(workspaceServiceUrl),
  };
}
