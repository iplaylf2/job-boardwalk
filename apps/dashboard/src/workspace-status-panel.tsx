import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  BrowserSessionPresence,
  PlatformAccessSummary,
  RecordedPlatformAuthenticationObservation,
} from "@job-boardwalk/contracts";

const authenticationCopy = {
  "authenticated-page": { label: "当时已登录", tone: "positive" },
  "login-redirect": { label: "当时未登录", tone: "attention" },
  "protected-resource": { label: "当时已登录", tone: "positive" },
} as const;

const interruptionCopy = {
  "access-denied": { label: "访问受阻", tone: "warning" },
  "verification-required": { label: "需要验证", tone: "attention" },
} as const;

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
  }).format(new Date(timestamp));
}

function BrowserStatus(props: { presence: BrowserSessionPresence }): JSX.Element {
  if (props.presence.state === "unknown") {
    return (
      <>
        <span class="status status-unknown">状态未知</span>
        <span class="status-meta">等待浏览器会话</span>
      </>
    );
  }
  if (props.presence.state === "offline") {
    return (
      <>
        <span class="status status-warning">会话离线</span>
        <span class="status-meta">{formatTimestamp(props.presence.lastReceivedAt)} 更新</span>
      </>
    );
  }
  return (
    <>
      <span
        class={`status ${
          props.presence.browserStatus.available ? "status-positive" : "status-attention"
        }`}
      >
        {props.presence.browserStatus.available ? "浏览器可用" : "浏览器不可用"}
      </span>
      <span class="status-meta">
        {props.presence.browserStatus.available
          ? `${String(props.presence.browserStatus.tabCount)} 个标签页`
          : `${formatTimestamp(props.presence.receivedAt)} 更新`}
      </span>
    </>
  );
}

function PlatformAuthenticationStatus(props: {
  observation: RecordedPlatformAuthenticationObservation;
}): JSX.Element {
  const copy = authenticationCopy[props.observation.evidence];
  return (
    <>
      <span class={`status status-${copy.tone}`}>{copy.label}</span>
      <time class="status-meta" datetime={props.observation.observedAt}>
        记录于 {formatTimestamp(props.observation.observedAt)}
      </time>
    </>
  );
}

function PlatformStatus(props: { platform: PlatformAccessSummary }): JSX.Element {
  return (
    <>
      <Show
        when={props.platform.unresolvedInterruption}
        fallback={
          <Show
            when={props.platform.latestAuthentication}
            fallback={
              <>
                <span class="status status-unknown">登录状态未确认</span>
                <span class="status-meta">等待页面证据</span>
              </>
            }
          >
            {(observation) => <PlatformAuthenticationStatus observation={observation()} />}
          </Show>
        }
      >
        {(observation) => {
          const copy = interruptionCopy[observation().interruption];
          return (
            <>
              <span class={`status status-${copy.tone}`}>{copy.label}</span>
              <time class="status-meta" datetime={observation().observedAt}>
                记录于 {formatTimestamp(observation().observedAt)}
              </time>
            </>
          );
        }}
      </Show>
    </>
  );
}

export function WorkspaceStatusPanel(props: {
  jobCount: number;
  presence: BrowserSessionPresence;
  platforms: PlatformAccessSummary[];
}): JSX.Element {
  return (
    <section class="status-panel" aria-labelledby="workspace-status-heading">
      <div class="status-panel-heading">
        <div>
          <p class="section-kicker">研究概况</p>
          <h2 id="workspace-status-heading">工作区正在记录什么</h2>
        </div>
        <a class="status-library-link" href="/jobs">
          查看全部岗位
          <span>{String(props.jobCount)}</span>
        </a>
      </div>
      <div class="status-items">
        <article class="status-item status-item-count">
          <span class="status-item-name">已整理岗位</span>
          <div class="status-count-value">
            <strong>{String(props.jobCount)}</strong>
            <span>个可回查岗位</span>
          </div>
        </article>
        <article class="status-item">
          <span class="status-item-name">浏览器会话</span>
          <div class="status-item-value">
            <BrowserStatus presence={props.presence} />
          </div>
        </article>
        <For each={props.platforms}>
          {(platform) => (
            <article class="status-item">
              <span class="status-item-name">{platform.label}</span>
              <div class="status-item-value">
                <PlatformStatus platform={platform} />
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}
