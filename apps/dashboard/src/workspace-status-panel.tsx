import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  BrowserSessionPresence,
  PlatformAccessSummary,
  RecordedPlatformAuthenticationObservation,
} from "@job-boardwalk/contracts";

import { SectionKicker } from "./ui/section-kicker.js";
import styles from "./workspace-status-panel.module.css";

const authenticationCopy = {
  "authenticated-page": { label: "当时已登录", tone: "positive" },
  "login-redirect": { label: "当时未登录", tone: "attention" },
  "protected-resource": { label: "当时已登录", tone: "positive" },
} as const;

const interruptionCopy = {
  "access-denied": { label: "访问受阻", tone: "warning" },
  "verification-required": { label: "需要验证", tone: "attention" },
} as const;

const toneClass = {
  attention: styles["attention"],
  positive: styles["positive"],
  unknown: styles["unknown"],
  warning: styles["warning"],
} as const;

function statusClass(tone: keyof typeof toneClass): string {
  return `${styles["status"]} ${toneClass[tone]}`;
}

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
        <span class={statusClass("unknown")}>状态未知</span>
        <span class={styles["meta"]}>尚未收到会话状态</span>
      </>
    );
  }
  if (props.presence.state === "offline") {
    return (
      <>
        <span class={statusClass("warning")}>会话离线</span>
        <span class={styles["meta"]}>
          最后更新于 {formatTimestamp(props.presence.lastReceivedAt)}
        </span>
      </>
    );
  }
  return (
    <>
      <span class={statusClass(props.presence.browserStatus.available ? "positive" : "attention")}>
        {props.presence.browserStatus.available ? "浏览器可用" : "浏览器不可用"}
      </span>
      <span class={styles["meta"]}>
        {props.presence.browserStatus.available
          ? `${String(props.presence.browserStatus.tabCount)} 个标签页`
          : `记录于 ${formatTimestamp(props.presence.receivedAt)}`}
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
      <span class={statusClass(copy.tone)}>{copy.label}</span>
      <time class={styles["meta"]} datetime={props.observation.observedAt}>
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
                <span class={statusClass("unknown")}>登录状态未确认</span>
                <span class={styles["meta"]}>尚无明确页面证据</span>
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
              <span class={statusClass(copy.tone)}>{copy.label}</span>
              <time class={styles["meta"]} datetime={observation().observedAt}>
                记录于 {formatTimestamp(observation().observedAt)}
              </time>
            </>
          );
        }}
      </Show>
    </>
  );
}

function needsAttention(
  presence: BrowserSessionPresence,
  platforms: PlatformAccessSummary[],
): boolean {
  const browserNeedsAttention =
    presence.state === "offline" ||
    (presence.state === "online" && !presence.browserStatus.available);
  return browserNeedsAttention || platforms.some((platform) => platform.unresolvedInterruption);
}

export function WorkspaceStatusPanel(props: {
  presence: BrowserSessionPresence;
  platforms: PlatformAccessSummary[];
}): JSX.Element {
  return (
    <aside
      class={`${styles["panel"]} ${
        needsAttention(props.presence, props.platforms) ? styles["panelAttention"] : ""
      }`}
      aria-labelledby="workspace-status-heading"
    >
      <div class={styles["heading"]}>
        <div>
          <SectionKicker>运行状态</SectionKicker>
          <h2 id="workspace-status-heading">浏览器与平台</h2>
        </div>
        <Show when={needsAttention(props.presence, props.platforms)}>
          <span class={styles["signal"]}>需要处理</span>
        </Show>
      </div>
      <div class={styles["items"]}>
        <article class={styles["item"]}>
          <span class={styles["itemName"]}>浏览器会话</span>
          <div class={styles["itemValue"]}>
            <BrowserStatus presence={props.presence} />
          </div>
        </article>
        <For each={props.platforms}>
          {(platform) => (
            <article class={styles["item"]}>
              <span class={styles["itemName"]}>{platform.label}</span>
              <div class={styles["itemValue"]}>
                <PlatformStatus platform={platform} />
              </div>
            </article>
          )}
        </For>
      </div>
    </aside>
  );
}
