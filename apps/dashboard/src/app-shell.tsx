import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import styles from "./app-shell.module.css";

type ActivePage = "jobs" | "overview" | "reports";

interface AppShellProps {
  active: ActivePage;
  children: JSX.Element;
  jobCount?: number;
  lede: string;
  title: string;
}

const navigationItems: { active: ActivePage; href: string; label: string }[] = [
  { active: "overview", href: "/", label: "工作区" },
  { active: "jobs", href: "/jobs", label: "岗位库" },
  { active: "reports", href: "/reports", label: "研究报告" },
];

function PrimaryNavigation(props: AppShellProps): JSX.Element {
  return (
    <nav class={styles["primaryNavigation"]} aria-label="主要导航">
      {navigationItems.map((item) => (
        <a
          href={item.href}
          {...(props.active === item.active ? { "aria-current": "page" as const } : {})}
        >
          {item.label}
          {item.active === "jobs" ? (
            <Show when={typeof props.jobCount === "number"}>
              <span>{String(props.jobCount)}</span>
            </Show>
          ) : null}
        </a>
      ))}
    </nav>
  );
}

export function AppShell(props: AppShellProps): JSX.Element {
  return (
    <main class={styles["shell"]}>
      <header class={styles["masthead"]}>
        <div class={styles["mastheadCopy"]}>
          <p class={styles["eyebrow"]}>本地 AI 求职秘书</p>
          <h1>{props.title}</h1>
          <p class={styles["lede"]}>{props.lede}</p>
        </div>
        <PrimaryNavigation {...props} />
      </header>
      {props.children}
    </main>
  );
}
