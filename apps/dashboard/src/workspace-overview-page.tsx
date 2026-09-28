import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import { AppShell } from "./app-shell.js";
import { PersonalContextPanel } from "./personal-context/panel.js";
import { WorkspaceDataBoundary } from "./workspace-data-boundary.js";
import { createPolledRead } from "./polled-read.js";
import { readWorkspaceOverview } from "./workspace-service-client.js";
import styles from "./workspace-overview-page.module.css";

const refreshIntervalMilliseconds = 5000;

export function WorkspaceOverviewPage(): JSX.Element {
  const workspaceOverview = createPolledRead(readWorkspaceOverview, refreshIntervalMilliseconds);

  return (
    <AppShell active="overview" title="Job Boardwalk" lede="查看和维护求职方向与个人条件。">
      <WorkspaceDataBoundary loading={<p class={styles["loading"]}>正在读取本机工作区…</p>}>
        <Show when={workspaceOverview.data()}>
          {(overview) => (
            <PersonalContextPanel
              facts={overview().profileFacts}
              intents={overview().jobSearchIntents}
              onChanged={workspaceOverview.refresh}
            />
          )}
        </Show>
      </WorkspaceDataBoundary>
    </AppShell>
  );
}
