import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  PlatformAccessSummary,
  RecordedPlatformAuthenticationObservation,
  RecordedPlatformAccessInterruptionObservation,
} from "@job-boardwalk/contracts";

import { SectionHeading } from "./section-heading.js";

const platformAuthenticationEvidenceCopy = {
  "authenticated-page": {
    detail: "页面当时显示了账户专属内容，可以确认会话已登录。",
    label: "当时已登录",
    tone: "positive",
  },
  "login-redirect": {
    detail: "浏览器当时访问了需要登录的页面，但平台将其转到了登录页。",
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
    detail: "平台当时拒绝了访问。当前情况请以平台窗口显示的内容为准。",
    label: "访问受阻",
    tone: "warning",
  },
  "verification-required": {
    detail: "平台当时要求人工验证。如果当前仍有提示，请在平台窗口中完成验证。",
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

function PlatformAuthenticationView(props: {
  observation: RecordedPlatformAuthenticationObservation;
}): JSX.Element {
  function authenticationCopy() {
    return platformAuthenticationEvidenceCopy[props.observation.evidence];
  }
  return (
    <div class="platform-observation">
      <span class={`status status-${authenticationCopy().tone}`}>{authenticationCopy().label}</span>
      <p>{authenticationCopy().detail}</p>
      <time datetime={props.observation.observedAt}>
        记录时间：{formatObservedAt(props.observation.observedAt)}
      </time>
    </div>
  );
}

function PlatformAccessInterruptionView(props: {
  observation: RecordedPlatformAccessInterruptionObservation;
}): JSX.Element {
  function interruptionCopy() {
    return platformAccessInterruptionCopy[props.observation.interruption];
  }
  return (
    <div class="platform-observation">
      <span class={`status status-${interruptionCopy().tone}`}>{interruptionCopy().label}</span>
      <p>{interruptionCopy().detail}</p>
      <time datetime={props.observation.observedAt}>
        记录时间：{formatObservedAt(props.observation.observedAt)}
      </time>
    </div>
  );
}

export function PlatformAccessPanel(props: { summaries: PlatformAccessSummary[] }): JSX.Element {
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
                    <span class="status status-unknown">还没有登录记录</span>
                    <p>获得明确结果后，会显示在这里。</p>
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
