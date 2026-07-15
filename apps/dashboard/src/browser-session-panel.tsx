import { createMemo, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { BrowserRuntimeStatus, BrowserSessionPresence } from "@job-boardwalk/contracts";

import { SectionHeading } from "./section-heading.js";

type AvailableBrowserStatus = Extract<BrowserRuntimeStatus, { available: true }>;
type OnlinePresence = Extract<BrowserSessionPresence, { state: "online" }>;
type UnavailableBrowserStatus = Extract<BrowserRuntimeStatus, { available: false }>;

function formatReceivedAt(receivedAt: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(receivedAt));
}

function AvailableBrowserView(props: { status: AvailableBrowserStatus }) {
  return (
    <>
      <span class="status status-positive">浏览器可用</span>
      <p>Browser Session 在线，当前有 {String(props.status.tabCount)} 个浏览器标签页。</p>
      <Show when={props.status.browserVersion}>
        {(version) => <strong>Chromium {version()}</strong>}
      </Show>
    </>
  );
}

function UnavailableBrowserView(props: { status: UnavailableBrowserStatus }) {
  return (
    <>
      <span class="status status-attention">浏览器不可用</span>
      <p>Browser Session 在线，但浏览器暂时无法执行工具。</p>
      <Show when={props.status.lastError}>{(lastError) => <strong>{lastError()}</strong>}</Show>
    </>
  );
}

function OnlinePresenceView(props: { presence: OnlinePresence }) {
  const availableStatus = createMemo(() => {
    const { browserStatus } = props.presence;
    return browserStatus.available ? browserStatus : null;
  });
  const unavailableStatus = createMemo(() => {
    const { browserStatus } = props.presence;
    return browserStatus.available ? null : browserStatus;
  });
  return (
    <div class="browser-session-presence">
      <Show
        when={availableStatus()}
        fallback={
          <Show when={unavailableStatus()}>
            {(status) => <UnavailableBrowserView status={status()} />}
          </Show>
        }
      >
        {(status) => <AvailableBrowserView status={status()} />}
      </Show>
      <time datetime={props.presence.receivedAt}>
        状态更新：{formatReceivedAt(props.presence.receivedAt)}
      </time>
    </div>
  );
}

function OfflinePresenceView(props: {
  presence: Extract<BrowserSessionPresence, { state: "offline" }>;
}) {
  return (
    <div class="browser-session-presence">
      <span class="status status-warning">Browser Session 离线</span>
      <p>已超过状态更新时限，浏览器当前状态未知。</p>
      <time datetime={props.presence.lastReceivedAt}>
        最后更新：{formatReceivedAt(props.presence.lastReceivedAt)}
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
                <span class="status status-unknown">Browser Session 状态未知</span>
                <p>启动 Browser Session 后，这里会显示浏览器运行状态。</p>
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
