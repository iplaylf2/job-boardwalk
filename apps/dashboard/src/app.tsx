import { createMemo, createSignal, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { WorkspaceOverview } from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- Vite owns the CSS side-effect import.
import "./styles.css";
import { BrowserSessionPanel } from "./browser-session-panel.js";
import { PersonalContextPanel } from "./personal-context/panel.js";
import { PlatformAccessPanel } from "./platform-access-panel.js";
import { readWorkspaceOverview } from "./workspace-service-client.js";

const initialRefreshCount = 0;
const refreshIncrement = 1;
const refreshIntervalMilliseconds = 5000;

function WorkspaceOverviewView(props: { onChanged: () => void; overview: WorkspaceOverview }) {
  return (
    <div class="grid">
      <BrowserSessionPanel presence={props.overview.browserSessionPresence} />
      <PlatformAccessPanel summaries={props.overview.platformAccessSummaries} />
      <PersonalContextPanel
        facts={props.overview.profileFacts}
        locations={props.overview.targetLocations}
        onChanged={props.onChanged}
      />
    </div>
  );
}

export function App(): JSX.Element {
  const [refreshCount, setRefreshCount] = createSignal(initialRefreshCount);
  const workspaceOverview = createMemo(() => {
    refreshCount();
    return readWorkspaceOverview();
  });
  onSettled(() => {
    const interval = setInterval(
      () => setRefreshCount((value) => value + refreshIncrement),
      refreshIntervalMilliseconds,
    );
    return () => clearInterval(interval);
  });

  return (
    <main>
      <header class="masthead">
        <div>
          <p class="eyebrow">本地 AI 求职秘书</p>
          <h1>Job Boardwalk</h1>
          <p class="lede">查看浏览器与平台状态，补充个人情况，帮助助手判断哪些机会更适合你。</p>
        </div>
      </header>

      <Loading fallback={<p class="loading">正在读取本机工作区…</p>}>
        <Show when={workspaceOverview()}>
          {(overview) => (
            <WorkspaceOverviewView
              overview={overview()}
              onChanged={() => setRefreshCount((value) => value + refreshIncrement)}
            />
          )}
        </Show>
      </Loading>
    </main>
  );
}
