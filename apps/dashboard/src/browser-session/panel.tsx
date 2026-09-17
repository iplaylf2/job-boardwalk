import { platformCatalog } from "@job-boardwalk/platform-catalog";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";
import { createPolledRead } from "#/polled-read.js";
import { checkBrowserSession } from "./health-check.js";
import type { BrowserSessionCheckResult } from "./health-check.js";
import styles from "./panel.module.css";

const refreshIntervalMilliseconds = 5000;

function checkResultLabel(result: BrowserSessionCheckResult): string {
  if (result.outcome === "observed") {
    if (!result.browser.available) {
      return "浏览器尚未就绪";
    }
    const labels = {
      active: "浏览器可用",
      "preparing-handoff": "正在准备浏览器交接",
      quiescing: "正在准备浏览器交接",
      "user-handoff": "浏览器由用户控制",
    };
    return labels[result.browser.control.state];
  }
  return {
    "configuration-error": "连接配置不可用",
    failed: "暂时无法读取状态",
    unconfigured: "未配置",
  }[result.outcome];
}

function CheckResult(props: { result: BrowserSessionCheckResult }): JSX.Element {
  function interruption() {
    return props.result.outcome === "observed" && props.result.browser.available
      ? props.result.browser.control.interruption
      : null;
  }
  return (
    <div class={styles["status"]}>
      <strong>{checkResultLabel(props.result)}</strong>
      <time datetime={props.result.checkedAt}>
        检查于 {new Date(props.result.checkedAt).toLocaleTimeString("zh-CN")}
      </time>
      <Show when={interruption()}>
        {(observation) => (
          <p class={styles["interruption"]}>
            {platformCatalog[observation().platformId].label} · 中断记录于{" "}
            {new Date(observation().observedAt).toLocaleString("zh-CN")}
            <br />
            中断来源：{observation().url}
          </p>
        )}
      </Show>
    </div>
  );
}

export function BrowserSessionStatusPanel(): JSX.Element {
  const result = createPolledRead(checkBrowserSession, refreshIntervalMilliseconds);
  return (
    <section class={styles["panel"]} aria-label="浏览器服务状态">
      <h2>浏览器服务</h2>
      <Loading fallback={<p>正在检查服务状态…</p>}>
        <Show when={result.data()}>{(value) => <CheckResult result={value()} />}</Show>
      </Loading>
    </section>
  );
}
