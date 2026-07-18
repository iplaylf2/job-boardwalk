import { createMemo, createSignal, For, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  ResearchReport,
  ResearchReportState,
  ResearchReportSummary,
} from "@job-boardwalk/contracts";

import { AppShell } from "#/app-shell.js";
import { listResearchReports, readResearchReport } from "#/workspace-service-client.js";

import { ResearchReportMarkdownView } from "./markdown-view.js";

// oxlint-disable-next-line import/no-unassigned-import -- The pages own their feature styles.
import "./styles.css";

const emptyCollectionLength = 0;
const initialRefreshCount = 0;
const refreshIncrement = 1;
const refreshIntervalMilliseconds = 5000;

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ReportStateBadge(props: { state: ResearchReportState }): JSX.Element {
  return (
    <span class={`research-report-state research-report-state-${props.state}`}>
      {props.state === "complete" ? "已完成" : "整理中"}
    </span>
  );
}

function ReportListItem(props: { report: ResearchReportSummary }): JSX.Element {
  return (
    <article class="research-report-list-item">
      <div>
        <ReportStateBadge state={props.report.state} />
        <h2>
          <a href={`/reports/${String(props.report.id)}`}>{props.report.title}</a>
        </h2>
      </div>
      <div class="research-report-list-meta">
        <span>更新于 {formatTimestamp(props.report.updatedAt)}</span>
        <Show when={props.report.expiresAt}>
          {(expiresAt) => <span>可见至 {formatTimestamp(expiresAt())}</span>}
        </Show>
      </div>
    </article>
  );
}

export function ResearchReportListPage(): JSX.Element {
  const [refreshCount, setRefreshCount] = createSignal(initialRefreshCount);
  const reportList = createMemo(() => {
    refreshCount();
    return listResearchReports();
  });
  onSettled(() => {
    const interval = setInterval(
      () => setRefreshCount((value) => value + refreshIncrement),
      refreshIntervalMilliseconds,
    );
    return () => clearInterval(interval);
  });

  return (
    <AppShell
      active="reports"
      title="研究报告"
      lede="集中阅读研究过程中形成的阶段性判断、依据与后续建议。"
    >
      <section class="research-report-list" aria-label="研究报告列表">
        <Loading fallback={<p class="research-report-empty">正在读取研究报告…</p>}>
          <Show
            when={reportList()}
            fallback={<p class="research-report-empty">当前没有可阅读的研究报告。</p>}
          >
            {(result) => (
              <Show
                when={result().reports.length > emptyCollectionLength}
                fallback={<p class="research-report-empty">当前没有可阅读的研究报告。</p>}
              >
                <For each={result().reports}>{(report) => <ReportListItem report={report} />}</For>
              </Show>
            )}
          </Show>
        </Loading>
      </section>
    </AppShell>
  );
}

function ResearchReportDocument(props: { report: ResearchReport }): JSX.Element {
  return (
    <article class="research-report-document">
      <header class="research-report-heading">
        <ReportStateBadge state={props.report.state} />
        <h2>{props.report.title}</h2>
        <p>
          更新于 {formatTimestamp(props.report.updatedAt)}
          <Show when={props.report.expiresAt}>
            {(expiresAt) => <> · 可见至 {formatTimestamp(expiresAt())}</>}
          </Show>
        </p>
      </header>
      <ResearchReportMarkdownView markdown={props.report.markdown} />
    </article>
  );
}

export function ResearchReportDetailPage(props: { reportId: number }): JSX.Element {
  const [refreshCount, setRefreshCount] = createSignal(initialRefreshCount);
  const report = createMemo(() => {
    refreshCount();
    return readResearchReport(props.reportId);
  });
  onSettled(() => {
    const interval = setInterval(
      () => setRefreshCount((value) => value + refreshIncrement),
      refreshIntervalMilliseconds,
    );
    return () => clearInterval(interval);
  });

  return (
    <AppShell
      active="reports"
      title="研究报告"
      lede="研究报告记录阶段性判断；岗位状态仍应回到招聘平台核验。"
    >
      <Loading fallback={<p class="research-report-empty">正在读取研究报告…</p>}>
        <Show when={report()}>{(result) => <ResearchReportDocument report={result()} />}</Show>
      </Loading>
    </AppShell>
  );
}
