import { createMemo, createSignal, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { WorkspaceOverview } from "@job-boardwalk/contracts";

import { AppShell } from "./app-shell.js";
import { PersonalContextPanel } from "./personal-context/panel.js";
import { WorkspaceStatusPanel } from "./workspace-status-panel.js";
import { readJobPostingPage, readWorkspaceOverview } from "./workspace-service-client.js";
import styles from "./workspace-overview-page.module.css";

const initialRefreshCount = 0;
const refreshIncrement = 1;
const refreshIntervalMilliseconds = 5000;
const summaryPage = 1;
const summaryPageSize = 3;

function WorkspaceOverviewView(props: {
  onChanged: () => void;
  overview: WorkspaceOverview;
}): JSX.Element {
  return (
    <div class={styles["layout"]}>
      <PersonalContextPanel
        facts={props.overview.profileFacts}
        intents={props.overview.jobSearchIntents}
        onChanged={props.onChanged}
      />
      <WorkspaceStatusPanel
        presence={props.overview.browserSessionPresence}
        platforms={props.overview.platformAccessSummaries}
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
  const interestedJobs = createMemo(() => {
    refreshCount();
    return readJobPostingPage({
      interestedOnly: true,
      page: summaryPage,
      pageSize: summaryPageSize,
    });
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
      interestedJobCount={interestedJobs()?.total}
      jobCount={jobSummary()?.total}
      title="Job Boardwalk"
      lede="围绕当前求职方向，持续整理研究中发现且可回查的岗位。"
    >
      <Loading fallback={<p class={styles["loading"]}>正在读取本机工作区…</p>}>
        <Show when={workspaceOverview() && jobSummary() && interestedJobs()}>
          <WorkspaceOverviewView
            overview={workspaceOverview()}
            onChanged={() => setRefreshCount((value) => value + refreshIncrement)}
          />
        </Show>
      </Loading>
    </AppShell>
  );
}
