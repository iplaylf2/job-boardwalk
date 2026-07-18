import { createMemo, createSignal, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { WorkspaceOverview } from "@job-boardwalk/contracts";

import { AppShell } from "./app-shell.js";
import { PersonalContextPanel } from "./personal-context/panel.js";
import { WorkspaceStatusPanel } from "./workspace-status-panel.js";
import { readJobPostingPage, readWorkspaceOverview } from "./workspace-service-client.js";

const initialRefreshCount = 0;
const refreshIncrement = 1;
const refreshIntervalMilliseconds = 5000;
const summaryPage = 1;
const summaryPageSize = 3;

function WorkspaceOverviewView(props: {
  jobCount: number;
  onChanged: () => void;
  overview: WorkspaceOverview;
}): JSX.Element {
  return (
    <div class="workspace">
      <WorkspaceStatusPanel
        jobCount={props.jobCount}
        presence={props.overview.browserSessionPresence}
        platforms={props.overview.platformAccessSummaries}
      />
      <PersonalContextPanel
        facts={props.overview.profileFacts}
        intents={props.overview.jobSearchIntents}
        onChanged={props.onChanged}
      />
    </div>
  );
}

export function WorkspaceOverviewPage(): JSX.Element {
  const [refreshCount, setRefreshCount] = createSignal(initialRefreshCount);
  const workspaceOverview = createMemo(() => {
    refreshCount();
    return readWorkspaceOverview();
  });
  const jobSummary = createMemo(() => {
    refreshCount();
    return readJobPostingPage({ page: summaryPage, pageSize: summaryPageSize });
  });
  onSettled(() => {
    const interval = setInterval(
      () => setRefreshCount((value) => value + refreshIncrement),
      refreshIntervalMilliseconds,
    );
    return () => clearInterval(interval);
  });

  return (
    <AppShell
      active="overview"
      jobCount={jobSummary()?.total}
      title="Job Boardwalk"
      lede="选定求职方向，自动整理研究中发现且可回查的岗位。"
    >
      <Loading fallback={<p class="loading">正在读取本机工作区…</p>}>
        <Show when={workspaceOverview() && jobSummary()}>
          <WorkspaceOverviewView
            jobCount={jobSummary().total}
            overview={workspaceOverview()}
            onChanged={() => setRefreshCount((value) => value + refreshIncrement)}
          />
        </Show>
      </Loading>
    </AppShell>
  );
}
