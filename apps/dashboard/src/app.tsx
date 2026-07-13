import { createMemo, createSignal, For, Loading, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  PlatformAccessSummary,
  ProfileFact,
  TargetLocation,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- Vite owns the CSS side-effect import.
import "./styles.css";
import { readWorkspaceOverview, requestBrowserHandoff } from "./runtime-api.js";

const initialRevision = 0;
const revisionIncrement = 1;
const emptyCollectionLength = 0;

function formatAuthenticationObservation(value?: string): string {
  if (!value) {
    return "登录状态待确认";
  }
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
  return `最近确认登录：${formatted}`;
}

function formatBrowserStatus(platformAccess: PlatformAccessSummary): string {
  if (platformAccess.browserSession === "open") {
    return "窗口正在运行";
  }
  return platformAccess.hasBrowserProfile ? "已保留浏览器资料" : "尚无浏览器资料";
}

function formatBrowserAction(platformAccess: PlatformAccessSummary): string {
  return platformAccess.authentication === "unknown" ? "前往登录" : "打开平台";
}

function SectionHeading(props: { number: string; title: string }) {
  return (
    <div class="section-heading">
      <span>{props.number}</span>
      <h2>{props.title}</h2>
    </div>
  );
}

function PlatformAccessPanel(props: {
  onBrowserHandoff: () => void;
  platformAccess: PlatformAccessSummary[];
}) {
  return (
    <section class="panel platforms">
      <SectionHeading number="01" title="平台访问" />
      <For each={props.platformAccess}>
        {(platformAccess) => (
          <article class="platform-row">
            <div class={`status-dot ${platformAccess.authentication}`} />
            <div class="platform-copy">
              <h3>{platformAccess.label}</h3>
              <p>{formatAuthenticationObservation(platformAccess.authenticationObservedAt)}</p>
            </div>
            <div class="platform-actions">
              <span class="tag">{formatBrowserStatus(platformAccess)}</span>
              <button
                class="handoff"
                type="button"
                onClick={async () => {
                  await requestBrowserHandoff(platformAccess);
                  props.onBrowserHandoff();
                }}
              >
                {formatBrowserAction(platformAccess)}
              </button>
            </div>
          </article>
        )}
      </For>
    </section>
  );
}

function ProfileFactsPanel(props: { facts: ProfileFact[] }) {
  return (
    <section class="panel profile">
      <SectionHeading number="02" title="求职资料" />
      <Show
        when={props.facts.length !== emptyCollectionLength}
        fallback={<p class="empty">尚无已登记的求职资料。与 AI 助手确认的信息会显示在这里。</p>}
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

function WorkspaceOverviewView(props: {
  onBrowserHandoff: () => void;
  overview: WorkspaceOverview;
}) {
  return (
    <div class="grid">
      <PlatformAccessPanel
        onBrowserHandoff={props.onBrowserHandoff}
        platformAccess={props.overview.platformAccess}
      />
      <ProfileFactsPanel facts={props.overview.profileFacts} />
      <TargetLocationsPanel locations={props.overview.targetLocations} />
    </div>
  );
}

export function App(): JSX.Element {
  const [revision, setRevision] = createSignal(initialRevision);
  const workspaceOverview = createMemo(() => {
    revision();
    return readWorkspaceOverview();
  });

  return (
    <main>
      <header class="masthead">
        <div>
          <p class="eyebrow">LOCAL AI JOB-SEARCH SECRETARY</p>
          <h1>Job Boardwalk</h1>
          <p class="lede">平台访问、求职资料和目标地点保存在本机，供你和 AI 助手持续协作。</p>
        </div>
        <button type="button" onClick={() => setRevision((value) => value + revisionIncrement)}>
          刷新状态
        </button>
      </header>

      <Loading fallback={<p class="loading">正在读取本地状态…</p>}>
        <Show when={workspaceOverview()}>
          {(overview) => (
            <WorkspaceOverviewView
              onBrowserHandoff={() => setRevision((value) => value + revisionIncrement)}
              overview={overview()}
            />
          )}
        </Show>
      </Loading>
    </main>
  );
}
