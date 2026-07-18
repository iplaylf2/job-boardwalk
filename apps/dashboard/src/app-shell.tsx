import type { JSX } from "@solidjs/web";

import styles from "./app-shell.module.css";

export function AppShell(props: {
  active: "jobs" | "overview" | "reports";
  children: JSX.Element;
  jobCount?: number;
  lede: string;
  title: string;
}): JSX.Element {
  return (
    <main class={styles["shell"]}>
      <header class={styles["masthead"]}>
        <div class={styles["mastheadCopy"]}>
          <p class={styles["eyebrow"]}>本地 AI 求职秘书</p>
          <h1>{props.title}</h1>
          <p class={styles["lede"]}>{props.lede}</p>
        </div>
        <nav class={styles["primaryNavigation"]} aria-label="主要导航">
          <a href="/" {...(props.active === "overview" ? { "aria-current": "page" as const } : {})}>
            工作区
          </a>
          <a href="/jobs" {...(props.active === "jobs" ? { "aria-current": "page" as const } : {})}>
            岗位库
            {typeof props.jobCount === "number" ? <span>{String(props.jobCount)}</span> : null}
          </a>
          <a
            href="/reports"
            {...(props.active === "reports" ? { "aria-current": "page" as const } : {})}
          >
            研究报告
          </a>
        </nav>
      </header>
      {props.children}
    </main>
  );
}
