import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  PlatformAccessSummary,
  RecordedPlatformAuthenticationObservation,
} from "@job-boardwalk/contracts";

import { SectionKicker } from "./ui/section-kicker.js";
import styles from "./platform-access-panel.module.css";

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

function PlatformAuthenticationStatus(props: {
  observation: RecordedPlatformAuthenticationObservation;
}): JSX.Element {
  const copy = authenticationCopy[props.observation.evidence];
  return (
    <>
      <span class={statusClass(copy.tone)}>{copy.label}</span>
      <time class={styles["meta"]} datetime={props.observation.lastObservedAt}>
        最近确认于 {formatTimestamp(props.observation.lastObservedAt)}
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
              <time class={styles["meta"]} datetime={observation().lastObservedAt}>
                最近发现于 {formatTimestamp(observation().lastObservedAt)}
              </time>
            </>
          );
        }}
      </Show>
    </>
  );
}

function needsAttention(platforms: PlatformAccessSummary[]): boolean {
  return platforms.some((platform) => platform.unresolvedInterruption);
}

export function PlatformAccessPanel(props: { platforms: PlatformAccessSummary[] }): JSX.Element {
  return (
    <aside
      class={`${styles["panel"]} ${
        needsAttention(props.platforms) ? styles["panelAttention"] : ""
      }`}
      aria-labelledby="platform-access-heading"
    >
      <div class={styles["heading"]}>
        <div>
          <SectionKicker>研究上下文</SectionKicker>
          <h2 id="platform-access-heading">平台访问记录</h2>
        </div>
        <Show when={needsAttention(props.platforms)}>
          <span class={styles["signal"]}>需要处理</span>
        </Show>
      </div>
      <div class={styles["items"]}>
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
