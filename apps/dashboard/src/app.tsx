import { createMemo, createSignal, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { WorkspaceOverview } from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- Vite owns the CSS side-effect import.
import "./styles.css";
import { PersonalContextPanel } from "./personal-context/panel.js";
import { WorkspaceStatusPanel } from "./workspace-status-panel.js";
import { readWorkspaceOverview } from "./workspace-service-client.js";

const initialRefreshCount = 0;
const refreshIncrement = 1;
const refreshIntervalMilliseconds = 5000;

function WorkspaceOverviewView(props: { onChanged: () => void; overview: WorkspaceOverview }) {
  return (
    <div class="workspace">
      <WorkspaceStatusPanel
        presence={props.overview.browserSessionPresence}
        platforms={props.overview.platformAccessSummaries}
      />
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
          <p class="lede">整理你的求职画像，让助手更快识别值得关注的机会。</p>
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
