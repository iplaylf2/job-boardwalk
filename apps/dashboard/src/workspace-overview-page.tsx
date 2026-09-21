import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { WorkspaceOverview } from "@job-boardwalk/contracts";

import { BrowserSessionStatusPanel } from "./browser-session/panel.js";
import { AppShell } from "./app-shell.js";
import { PersonalContextPanel } from "./personal-context/panel.js";
import { PlatformAccessPanel } from "./platform-access-panel.js";
import { WorkspaceDataBoundary } from "./workspace-data-boundary.js";
import { createPolledRead } from "./polled-read.js";
import { readWorkspaceOverview } from "./workspace-service-client.js";
import styles from "./workspace-overview-page.module.css";

const refreshIntervalMilliseconds = 5000;

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
      <PlatformAccessPanel platforms={props.overview.platformAccessSummaries} />
    </div>
  );
}

export function WorkspaceOverviewPage(): JSX.Element {
  const workspaceOverview = createPolledRead(readWorkspaceOverview, refreshIntervalMilliseconds);

  return (
    <AppShell
      active="overview"
      title="Job Boardwalk"
      lede="持续整理招聘平台中已发现且可回查的岗位，并保留当前研究依据。"
    >
      <BrowserSessionStatusPanel />
      <WorkspaceDataBoundary loading={<p class={styles["loading"]}>正在读取本机工作区…</p>}>
        <Show when={workspaceOverview.data()}>
          {(overview) => (
            <WorkspaceOverviewView overview={overview()} onChanged={workspaceOverview.refresh} />
          )}
        </Show>
      </WorkspaceDataBoundary>
    </AppShell>
  );
}
