import { render } from "@solidjs/web";
import { createMemo, createSignal, For, Loading, Show } from "solid-js";
import type {
  PlatformLoginStatus,
  ProfileFact,
  TargetLocation,
  WorkspaceOverview,
} from "@job-boardwalk/state-api";

// oxlint-disable-next-line import/no-unassigned-import -- Vite owns the CSS side-effect import.
import "./styles.css";

const initialRevision = 0;
const revisionIncrement = 1;
const emptyCollectionLength = 0;

async function loadWorkspaceOverview(): Promise<WorkspaceOverview> {
  const response = await fetch("/api/workspace");
  if (!response.ok) {
    throw new Error("无法读取工作区状态");
  }
  return (await response.json()) as WorkspaceOverview;
}

function formatAuthenticatedAt(value?: string): string {
  if (!value) {
    return "尚无登录记录";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SectionHeading(props: { number: string; title: string }) {
  return (
    <div class="section-heading">
      <span>{props.number}</span>
      <h2>{props.title}</h2>
    </div>
  );
}

function PlatformLoginsPanel(props: { platformLogins: PlatformLoginStatus[] }) {
  return (
    <section class="panel platforms">
      <SectionHeading number="01" title="招聘站点" />
      <For each={props.platformLogins}>
        {(platformLogin) => (
          <article class="platform-row">
            <div class={`status-dot ${platformLogin.status}`} />
            <div class="platform-copy">
              <h3>{platformLogin.label}</h3>
              <p>{formatAuthenticatedAt(platformLogin.lastAuthenticatedAt)}</p>
            </div>
            <span class="tag">
              {platformLogin.hasBrowserProfile ? "浏览器资料已保存" : "未保存浏览器资料"}
            </span>
          </article>
        )}
      </For>
    </section>
  );
}

function ProfileFactsPanel(props: { facts: ProfileFact[] }) {
  return (
    <section class="panel profile">
      <SectionHeading number="02" title="个人资料" />
      <Show
        when={props.facts.length !== emptyCollectionLength}
        fallback={<p class="empty">还没有个人资料。与 AI 助手确认的信息会出现在这里。</p>}
      >
        <dl>
          <For each={props.facts}>
            {(fact) => (
              <div>
                <dt>{fact.key}</dt>
                <dd>{fact.value}</dd>
                <span>{fact.confirmed ? "已确认" : `待确认 · ${fact.source}`}</span>
              </div>
            )}
          </For>
        </dl>
      </Show>
    </section>
  );
}

function TargetLocationsPanel(props: { locations: TargetLocation[] }) {
  return (
    <section class="panel intent">
      <SectionHeading number="03" title="目标城市" />
      <Show
        when={props.locations.length !== emptyCollectionLength}
        fallback={<p class="empty">尚未设置目标城市。</p>}
      >
        <div class="locations">
          <For each={props.locations}>
            {(location) => (
              <div class="location-card">
                <strong>{location.city}</strong>
                <span>{location.requirement === "required" ? "必须" : "偏好"}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

function WorkspaceOverviewView(props: { overview: WorkspaceOverview }) {
  return (
    <div class="grid">
      <PlatformLoginsPanel platformLogins={props.overview.platformLogins} />
      <ProfileFactsPanel facts={props.overview.profileFacts} />
      <TargetLocationsPanel locations={props.overview.targetLocations} />
    </div>
  );
}

function App() {
  const [revision, setRevision] = createSignal(initialRevision);
  const workspaceOverview = createMemo(() => {
    revision();
    return loadWorkspaceOverview();
  });

  return (
    <main>
      <header class="masthead">
        <div>
          <p class="eyebrow">LOCAL RECRUITING WORKSPACE</p>
          <h1>Job Boardwalk</h1>
          <p class="lede">你的求职状态保存在本地，登录记录与对话确认的信息汇聚于此。</p>
        </div>
        <button type="button" onClick={() => setRevision((value) => value + revisionIncrement)}>
          刷新状态
        </button>
      </header>

      <Loading fallback={<p class="loading">正在读取本地状态…</p>}>
        <Show when={workspaceOverview()}>
          {(overview) => <WorkspaceOverviewView overview={overview()} />}
        </Show>
      </Loading>
    </main>
  );
}

const root = document.querySelector("#app");
if (root === null) {
  throw new Error("找不到应用挂载点");
}
render(() => <App />, root);
