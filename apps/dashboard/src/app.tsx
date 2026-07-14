import { createMemo, createSignal, For, Loading, Show } from "solid-js";
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
import { readWorkspaceOverview } from "./workspace-service-client.js";

const initialRefreshCount = 0;
const refreshIncrement = 1;
const emptyCollectionLength = 0;

const platformAuthenticationCopy = {
  authenticated: {
    detail: "本次观察在页面中识别到已登录账号。",
    label: "观察时已登录",
    tone: "positive",
  },
  unauthenticated: {
    detail: "本次观察显示平台登录页面。",
    label: "观察时未登录",
    tone: "attention",
  },
} as const;

const platformAccessInterruptionCopy = {
  "access-denied": {
    detail: "平台拒绝了该次页面访问。请查看项目浏览器中的提示，再与 AI 助手决定是否重试。",
    label: "访问受阻",
    tone: "warning",
  },
  "verification-required": {
    detail: "页面要求人工验证。请在项目浏览器中完成验证，然后告诉 AI 助手可以继续。",
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

function SectionHeading(props: { number: string; title: string }) {
  return (
    <div class="section-heading">
      <span>{props.number}</span>
      <h2>{props.title}</h2>
    </div>
  );
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
        {(accountDisplayName) => <strong class="account">页面账号：{accountDisplayName()}</strong>}
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
      <SectionHeading number="01" title="平台访问" />
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
                    <span class="status status-unknown">尚无登录状态记录</span>
                    <p>AI 助手首次观察该平台页面后，登录状态会显示在这里。</p>
                  </div>
                }
              >
                {(observation) => <PlatformAuthenticationView observation={observation()} />}
              </Show>
              <Show when={platform.activeInterruption}>
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

  return (
    <main>
      <header class="masthead">
        <div>
          <p class="eyebrow">本地 AI 求职秘书</p>
          <h1>Job Boardwalk</h1>
          <p class="lede">平台访问观察、求职资料和目标城市保存在本机，供你与 AI 助手持续协作。</p>
        </div>
        <button type="button" onClick={() => setRefreshCount((value) => value + refreshIncrement)}>
          重新读取本地记录
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
