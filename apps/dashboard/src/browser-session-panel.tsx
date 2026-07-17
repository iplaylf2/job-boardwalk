import { createMemo, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { BrowserRuntimeStatus, BrowserSessionPresence } from "@job-boardwalk/contracts";

import { SectionHeading } from "./section-heading.js";

type AvailableBrowserStatus = Extract<BrowserRuntimeStatus, { available: true }>;
type OnlinePresence = Extract<BrowserSessionPresence, { state: "online" }>;

function formatReceivedAt(receivedAt: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(receivedAt));
}

function AvailableBrowserView(props: { status: AvailableBrowserStatus }) {
  return (
    <>
      <div class="browser-session-summary">
        <span class="status status-positive">浏览器可用</span>
        <p>Browser Session 在线；当前有 {String(props.status.tabCount)} 个浏览器标签页。</p>
      </div>
      <Show when={props.status.browserVersion}>
        {(version) => <span class="browser-session-meta">Chromium {version()}</span>}
      </Show>
    </>
  );
}

function UnavailableBrowserView() {
  return (
    <div class="browser-session-summary">
      <span class="status status-attention">浏览器不可用</span>
      <p>会话服务仍在线，但当前没有可用的受控浏览器。可稍后重试或检查运行环境。</p>
    </div>
  );
}

function OnlinePresenceView(props: { presence: OnlinePresence }) {
  const availableStatus = createMemo(() => {
    const { browserStatus } = props.presence;
    return browserStatus.available ? browserStatus : null;
  });
  return (
    <div class="browser-session-presence">
      <Show when={availableStatus()} fallback={<UnavailableBrowserView />}>
        {(status) => <AvailableBrowserView status={status()} />}
      </Show>
      <time class="browser-session-meta" datetime={props.presence.receivedAt}>
        报告时间：{formatReceivedAt(props.presence.receivedAt)}
      </time>
    </div>
  );
}

function OfflinePresenceView(props: {
  presence: Extract<BrowserSessionPresence, { state: "offline" }>;
}) {
  return (
    <div class="browser-session-presence">
      <div class="browser-session-summary">
        <span class="status status-warning">Browser Session 离线</span>
        <p>状态报告已经超时，浏览器当前状态未知。</p>
      </div>
      <time class="browser-session-meta" datetime={props.presence.lastReceivedAt}>
        最后报告：{formatReceivedAt(props.presence.lastReceivedAt)}
      </time>
    </div>
  );
}

export function BrowserSessionPanel(props: { presence: BrowserSessionPresence }): JSX.Element {
  return (
    <section class="panel browser-session">
      <SectionHeading number="01" title="浏览器会话" />
      <Show
        when={props.presence.state === "online" ? props.presence : null}
        fallback={
          <Show
            when={props.presence.state === "offline" ? props.presence : null}
            fallback={
              <div class="browser-session-presence">
                <div class="browser-session-summary">
                  <span class="status status-unknown">Browser Session 状态未知</span>
                  <p>启动 Browser Session 后，这里会显示浏览器运行状态。</p>
                </div>
              </div>
            }
          >
            {(presence) => <OfflinePresenceView presence={presence()} />}
          </Show>
        }
      >
        {(presence) => <OnlinePresenceView presence={presence()} />}
      </Show>
    </section>
  );
}
