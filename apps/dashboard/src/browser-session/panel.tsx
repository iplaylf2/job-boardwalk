import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";
import { createPolledRead } from "#/polled-read.js";
import { checkBrowserSession } from "./health-check.js";
import type { BrowserSessionCheckResult } from "./health-check.js";
import styles from "./panel.module.css";

const refreshIntervalMilliseconds = 5000;

function checkResultLabel(result: BrowserSessionCheckResult): string {
  if (result.outcome === "observed") {
    return result.browser.available ? "浏览器可用" : "浏览器尚未就绪";
  }
  return {
    "configuration-error": "连接配置不可用",
    failed: "暂时无法读取状态",
    unconfigured: "未配置",
  }[result.outcome];
}

function CheckResult(props: { result: BrowserSessionCheckResult }): JSX.Element {
  return (
    <div class={styles["status"]}>
      <strong>{checkResultLabel(props.result)}</strong>
      <time datetime={props.result.checkedAt}>
        检查于 {new Date(props.result.checkedAt).toLocaleTimeString("zh-CN")}
      </time>
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
