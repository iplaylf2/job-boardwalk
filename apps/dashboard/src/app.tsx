import { createMemo, createSignal, For, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  PlatformAccessSummary,
  PlatformAuthenticationObservation,
  PlatformAccessInterruptionObservation,
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

const platformAuthenticationCopy = {
  authenticated: {
    detail: "页面观察中出现了账号身份信息。",
    label: "观察时已登录",
    tone: "positive",
  },
  unauthenticated: {
    detail: "观察记录显示当时为平台登录页面。",
    label: "观察时未登录",
    tone: "attention",
  },
} as const;

const platformAccessInterruptionCopy = {
  "access-denied": {
    detail: "观察时页面拒绝了访问；请以平台窗口当前显示的内容为准。",
    label: "访问受阻",
    tone: "warning",
  },
  "verification-required": {
    detail: "观察时页面要求人工验证；如果平台窗口仍有提示，请先在窗口中完成验证。",
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

function PlatformAuthenticationView(props: { observation: PlatformAuthenticationObservation }) {
  function authenticationCopy() {
    return platformAuthenticationCopy[props.observation.authenticationState];
  }
  return (
    <div class="platform-observation">
      <span class={`status status-${authenticationCopy().tone}`}>{authenticationCopy().label}</span>
      <p>{authenticationCopy().detail}</p>
      <Show when={props.observation.accountDisplayName}>
        {(accountDisplayName) => (
          <strong class="account">观察到的页面账号：{accountDisplayName()}</strong>
        )}
      </Show>
      <time datetime={props.observation.observedAt}>
        观察时间：{formatObservedAt(props.observation.observedAt)}
      </time>
    </div>
  );
}

function PlatformAccessInterruptionView(props: {
  observation: PlatformAccessInterruptionObservation;
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
      <SectionHeading number="02" title="平台访问观察" />
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
                    <span class="status status-unknown">登录状态尚未记录</span>
                    <p>完成一次明确的页面观察后，结果会显示在这里。</p>
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
        fallback={<p class="empty">尚未登记求职资料。</p>}
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
            浏览器会话、平台访问观察、求职资料和目标城市集中呈现，无需保持 AI 助手会话。
          </p>
        </div>
        <button type="button" onClick={() => setRefreshCount((value) => value + refreshIncrement)}>
          刷新工作区
        </button>
      </header>

      <Loading fallback={<p class="loading">正在读取本机工作区…</p>}>
        <Show when={workspaceOverview()}>
          {(overview) => <WorkspaceOverviewView overview={overview()} />}
        </Show>
      </Loading>
    </main>
  );
}
