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
        <p>会话服务在线，当前打开了 {String(props.status.tabCount)} 个浏览器标签页。</p>
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
      <p>会话服务仍在线，但浏览器暂时不可用。可以稍后重试，或检查运行环境。</p>
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
        状态更新时间：{formatReceivedAt(props.presence.receivedAt)}
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
        <span class="status status-warning">会话服务离线</span>
        <p>暂时没有收到最新状态，目前无法确定浏览器是否可用。</p>
      </div>
      <time class="browser-session-meta" datetime={props.presence.lastReceivedAt}>
        最后更新时间：{formatReceivedAt(props.presence.lastReceivedAt)}
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
                  <span class="status status-unknown">会话状态未知</span>
                  <p>启动会话服务后，这里会显示浏览器是否可用。</p>
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
