import type { JSX } from "@solidjs/web";

export function AppShell(props: {
  active: "jobs" | "overview";
  children: JSX.Element;
  jobCount?: number;
  lede: string;
  title: string;
}): JSX.Element {
  return (
    <main>
      <header class="masthead">
        <div class="masthead-copy">
          <p class="eyebrow">本地 AI 求职秘书</p>
          <h1>{props.title}</h1>
          <p class="lede">{props.lede}</p>
        </div>
        <nav class="primary-navigation" aria-label="主要导航">
          <a href="/" {...(props.active === "overview" ? { "aria-current": "page" as const } : {})}>
            工作区
          </a>
          <a href="/jobs" {...(props.active === "jobs" ? { "aria-current": "page" as const } : {})}>
            岗位库
            {typeof props.jobCount === "number" ? <span>{String(props.jobCount)}</span> : null}
          </a>
        </nav>
      </header>
      {props.children}
    </main>
  );
}
