import { createMemo, createSignal, For, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  PlatformAccessSummary,
  RecordedPlatformAuthenticationObservation,
  RecordedPlatformAccessInterruptionObservation,
  ProfileFact,
  TargetLocation,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- Vite owns the CSS side-effect import.
import "./styles.css";
import { BrowserSessionPanel } from "./browser-session-panel.js";
import { SectionHeading } from "./section-heading.js";
import { readWorkspaceOverview } from "./workspace-service-client.js";

const initialRefreshCount = 0;
const refreshIncrement = 1;
const refreshIntervalMilliseconds = 5000;
const emptyCollectionLength = 0;

const platformAuthenticationEvidenceCopy = {
  "authenticated-page": {
    detail: "页面当时显示了账户专属内容，表明会话已登录。",
    label: "当时已登录",
    tone: "positive",
  },
  "login-redirect": {
    detail: "浏览器当时访问需要登录的页面，但平台将其转到了登录页。",
    label: "当时未登录",
    tone: "attention",
  },
  "protected-resource": {
    detail: "浏览器当时成功打开了需要登录的页面。",
    label: "当时已登录",
    tone: "positive",
  },
} as const;

const platformAccessInterruptionCopy = {
  "access-denied": {
    detail: "平台当时拒绝了访问；请以平台窗口当前显示的内容为准。",
    label: "访问受阻",
    tone: "warning",
  },
  "verification-required": {
    detail: "平台当时要求人工验证；若当前仍有提示，请在平台窗口中完成验证。",
    label: "需要人工验证",
    tone: "attention",
  },
} as const;

function formatObservedAt(observedAt: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(observedAt));
}

function formatProfileFactSource(source: string): string {
  const sourceCopy: Record<string, string> = {
    agent: "AI 助手",
    system: "系统",
    user: "用户",
  };
  return sourceCopy[source] ?? source;
}

function PlatformAuthenticationView(props: {
  observation: RecordedPlatformAuthenticationObservation;
}) {
  function authenticationCopy() {
    return platformAuthenticationEvidenceCopy[props.observation.evidence];
  }
  return (
    <div class="platform-observation">
      <span class={`status status-${authenticationCopy().tone}`}>{authenticationCopy().label}</span>
      <p>{authenticationCopy().detail}</p>
      <time datetime={props.observation.observedAt}>
        观察时间：{formatObservedAt(props.observation.observedAt)}
      </time>
    </div>
  );
}

function PlatformAccessInterruptionView(props: {
  observation: RecordedPlatformAccessInterruptionObservation;
}) {
  function interruptionCopy() {
    return platformAccessInterruptionCopy[props.observation.interruption];
  }
  return (
    <div class="platform-observation">
      <span class={`status status-${interruptionCopy().tone}`}>{interruptionCopy().label}</span>
      <p>{interruptionCopy().detail}</p>
      <time datetime={props.observation.observedAt}>
        观察时间：{formatObservedAt(props.observation.observedAt)}
      </time>
    </div>
  );
}

function PlatformAccessPanel(props: { summaries: PlatformAccessSummary[] }) {
  return (
    <section class="panel platform-access">
      <SectionHeading number="02" title="平台访问记录" />
      <div class="platform-list">
        <For each={props.summaries}>
          {(platform) => (
            <article class="platform-row">
              <div class="platform-name">
                <span aria-hidden="true" class="platform-dot" />
                <h3>{platform.label}</h3>
              </div>
              <Show
                when={platform.latestAuthentication}
                fallback={
                  <div class="platform-observation empty-observation">
                    <span class="status status-unknown">暂无登录记录</span>
                    <p>有明确的登录结果后，会显示在这里。</p>
                  </div>
                }
              >
                {(observation) => <PlatformAuthenticationView observation={observation()} />}
              </Show>
              <Show when={platform.unresolvedInterruption}>
                {(observation) => <PlatformAccessInterruptionView observation={observation()} />}
              </Show>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

function ProfileFactsPanel(props: { facts: ProfileFact[] }) {
  return (
    <section class="panel profile">
      <SectionHeading number="03" title="求职资料" />
      <Show
        when={props.facts.length !== emptyCollectionLength}
        fallback={<p class="empty">暂无求职资料。</p>}
      >
        <dl>
          <For each={props.facts}>
            {(fact) => (
              <div>
                <dt>{fact.key}</dt>
                <dd>{fact.value}</dd>
                <span>
                  {fact.confirmed
                    ? "已确认"
                    : `待确认 · 来源：${formatProfileFactSource(fact.source)}`}
                </span>
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
      <SectionHeading number="04" title="目标城市" />
      <Show
        when={props.locations.length !== emptyCollectionLength}
        fallback={<p class="empty">暂无目标城市。</p>}
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
      <BrowserSessionPanel presence={props.overview.browserSessionPresence} />
      <PlatformAccessPanel summaries={props.overview.platformAccessSummaries} />
      <ProfileFactsPanel facts={props.overview.profileFacts} />
      <TargetLocationsPanel locations={props.overview.targetLocations} />
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
          <p class="lede">
            集中查看浏览器状态、平台访问记录、求职资料和目标城市，无需保持 AI 助手会话。
          </p>
        </div>
      </header>

      <Loading fallback={<p class="loading">正在读取本机工作区…</p>}>
        <Show when={workspaceOverview()}>
          {(overview) => <WorkspaceOverviewView overview={overview()} />}
        </Show>
      </Loading>
    </main>
  );
}
