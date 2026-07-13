import { createMemo, createSignal, For, Loading, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  PlatformAccessObservation,
  PlatformAccessState,
  PlatformAccessSummary,
  ProfileFact,
  TargetLocation,
  WorkspaceOverview,
} from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- Vite owns the CSS side-effect import.
import "./styles.css";
import { readWorkspaceOverview } from "./workspace-service-client.js";

const initialRevision = 0;
const revisionIncrement = 1;
const emptyCollectionLength = 0;

const platformAccessStateCopy = {
  authenticated: {
    detail: "站点页面在本次观察时显示账号已登录。",
    label: "观察时已登录",
    tone: "positive",
  },
  "authentication-unverified": {
    detail: "浏览器中发现了登录会话线索，但站点页面尚未确认其有效性。",
    label: "发现会话线索",
    tone: "tentative",
  },
  blocked: {
    detail: "站点在本次观察时拒绝了访问。需要由你或 AI 助手排查后重试。",
    label: "观察时访问受阻",
    tone: "warning",
  },
  "login-required": {
    detail: "本次观察到登录页面。请在 AI 助手打开的浏览器窗口中完成登录。",
    label: "观察时需要登录",
    tone: "attention",
  },
  "verification-required": {
    detail: "本次观察到验证码或其他人工验证。请在 AI 助手打开的浏览器窗口中完成验证。",
    label: "观察时需要验证",
    tone: "attention",
  },
} as const satisfies Record<PlatformAccessState, { detail: string; label: string; tone: string }>;

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

function PlatformAccessObservationView(props: { observation: PlatformAccessObservation }) {
  function stateCopy() {
    return platformAccessStateCopy[props.observation.state];
  }
  return (
    <div class="platform-observation">
      <span class={`status status-${stateCopy().tone}`}>{stateCopy().label}</span>
      <p>{stateCopy().detail}</p>
      <Show when={props.observation.accountDisplayName}>
        {(accountDisplayName) => (
          <strong class="account">观察到的账号：{accountDisplayName()}</strong>
        )}
      </Show>
      <time datetime={props.observation.observedAt}>
        观察时间：{formatObservedAt(props.observation.observedAt)}
      </time>
    </div>
  );
}

function PlatformAccessPanel(props: { platforms: PlatformAccessSummary[] }) {
  return (
    <section class="panel platform-access">
      <SectionHeading number="01" title="平台访问" />
      <div class="platform-list">
        <For each={props.platforms}>
          {(platform) => (
            <article class="platform-row">
              <div class="platform-name">
                <span aria-hidden="true" class="platform-dot" />
                <h3>{platform.label}</h3>
              </div>
              <Show
                when={platform.latestObservation}
                fallback={
                  <div class="platform-observation empty-observation">
                    <span class="status status-unknown">暂无访问观察</span>
                    <p>AI 助手通过浏览器访问该平台后，观察记录会显示在这里。</p>
                  </div>
                }
              >
                {(observation) => <PlatformAccessObservationView observation={observation()} />}
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
      <PlatformAccessPanel platforms={props.overview.platformAccess} />
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
          <p class="eyebrow">本地 AI 求职秘书</p>
          <h1>Job Boardwalk</h1>
          <p class="lede">
            最近一次浏览器观察、求职资料和目标城市保存在本机，供你与 AI 助手持续协作。
          </p>
        </div>
        <button type="button" onClick={() => setRevision((value) => value + revisionIncrement)}>
          刷新记录
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
