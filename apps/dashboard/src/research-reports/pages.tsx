import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ResearchReport, ResearchReportSummary } from "@job-boardwalk/contracts";

import { AppShell } from "#/app-shell.js";
import { WorkspaceDataBoundary } from "#/workspace-data-boundary.js";
import { createPolledRead } from "#/polled-read.js";
import { listResearchReports, readResearchReport } from "#/workspace-service-client.js";

import { ResearchReportMarkdownView } from "./markdown-view.js";
import styles from "./pages.module.css";

const emptyCollectionLength = 0;
const refreshIntervalMilliseconds = 5000;

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ReportListItem(props: { report: ResearchReportSummary }): JSX.Element {
  return (
    <article class={styles["listItem"]}>
      <div>
        <h2>
          <a href={`/reports/${String(props.report.id)}`}>{props.report.title}</a>
        </h2>
      </div>
      <div class={styles["listMeta"]}>
        <span>更新于 {formatTimestamp(props.report.updatedAt)}</span>
      </div>
    </article>
  );
}

export function ResearchReportListPage(): JSX.Element {
  const reportList = createPolledRead(listResearchReports, refreshIntervalMilliseconds);

  return (
    <AppShell active="reports" title="研究报告" lede="按更新时间从新到旧查看已保存的研究报告。">
      <section class={styles["list"]} aria-label="研究报告列表">
        <WorkspaceDataBoundary loading={<p class={styles["empty"]}>正在读取研究报告…</p>}>
          <Show
            when={reportList.data()}
            fallback={<p class={styles["empty"]}>当前没有研究报告。</p>}
          >
            {(result) => (
              <Show
                when={result().reports.length > emptyCollectionLength}
                fallback={<p class={styles["empty"]}>当前没有研究报告。</p>}
              >
                <For each={result().reports}>{(report) => <ReportListItem report={report} />}</For>
              </Show>
            )}
          </Show>
        </WorkspaceDataBoundary>
      </section>
    </AppShell>
  );
}

function ResearchReportDocument(props: { report: ResearchReport }): JSX.Element {
  return (
    <article class={styles["document"]}>
      <header class={styles["heading"]}>
        <h2>{props.report.title}</h2>
        <p>更新于 {formatTimestamp(props.report.updatedAt)}</p>
      </header>
      <ResearchReportMarkdownView markdown={props.report.markdown} />
    </article>
  );
}

export function ResearchReportDetailPage(props: { reportId: number }): JSX.Element {
  const report = createPolledRead(
    () => readResearchReport(props.reportId),
    refreshIntervalMilliseconds,
  );

  return (
    <AppShell active="reports" title="研究报告" lede="阅读已保存的研究内容。">
      <WorkspaceDataBoundary loading={<p class={styles["empty"]}>正在读取研究报告…</p>}>
        <Show when={report.data()}>{(result) => <ResearchReportDocument report={result()} />}</Show>
      </WorkspaceDataBoundary>
    </AppShell>
  );
}
