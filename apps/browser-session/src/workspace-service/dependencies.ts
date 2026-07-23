import { WorkspaceJobEngagementWriter } from "./job-engagement-writer.js";
import { WorkspaceJobObservationWriter } from "./job-observation-writer.js";

export function createWorkspaceServiceClients(workspaceServiceUrl: URL): {
  jobEngagementWriter: WorkspaceJobEngagementWriter;
  jobObservationWriter: WorkspaceJobObservationWriter;
} {
  return {
    jobEngagementWriter: new WorkspaceJobEngagementWriter(workspaceServiceUrl),
    jobObservationWriter: new WorkspaceJobObservationWriter(workspaceServiceUrl),
  };
}
