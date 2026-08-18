import { createSignal, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { JobDescriptionStatusFilter } from "@job-boardwalk/contracts";
import type { JobPosting } from "@job-boardwalk/contracts";

import { AppShell } from "#/app-shell.js";
import { WorkspaceDataBoundary } from "#/workspace-data-boundary.js";
import { createWorkspaceRead } from "#/workspace-read.js";
import { readJobPostingPage } from "#/workspace-service-client.js";

import { JobDescriptionDialog } from "./description-dialog.js";
import { jobLibraryViewLabel, jobLibraryViews, readJobLibraryView } from "./engagement.js";
import type { JobLibraryView } from "./engagement.js";
import { JobResults } from "./results.js";
import styles from "./page.module.css";

const allPlatforms = "all";
const allDescriptionStatuses = "all";
const firstPage = 1;
const jobLibraryLede = "集中查看已收录岗位、平台跟进记录和详情采集情况。";
const pageSize = 24;
const refreshIntervalMilliseconds = 30_000;
type DescriptionStatusSelection = typeof allDescriptionStatuses | JobDescriptionStatusFilter;

function engagementHref(view: JobLibraryView): string {
  return view === "all" ? "/jobs" : `/jobs?engagement=${view}`;
}

function JobEngagementNavigation(props: { view: JobLibraryView }): JSX.Element {
  return (
    <nav class={styles["engagementNavigation"]} aria-label="岗位跟进筛选">
      {jobLibraryViews.map((view) => (
        <a
          href={engagementHref(view)}
          {...(props.view === view ? { "aria-current": "page" as const } : {})}
        >
          {jobLibraryViewLabel(view)}
        </a>
      ))}
    </nav>
  );
}

function JobLibraryFilters(props: {
  descriptionStatus: DescriptionStatusSelection;
  draftQuery: string;
  onDescriptionStatusChanged: (descriptionStatus: DescriptionStatusSelection) => void;
  onPlatformChanged: (platform: string) => void;
  onQueryChanged: (query: string) => void;
  onSubmitted: () => void;
  platform: string;
}): JSX.Element {
  return (
    <form
      class={styles["filters"]}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmitted();
      }}
    >
      <label>
        搜索岗位
        <input
          type="search"
          value={props.draftQuery}
          placeholder="岗位、公司、地点或标签"
          onInput={(event) => props.onQueryChanged(event.currentTarget.value)}
        />
      </label>
      <label>
        平台
        <select
          value={props.platform}
          onChange={(event) => props.onPlatformChanged(event.currentTarget.value)}
        >
          <option value={allPlatforms}>全部平台</option>
          <option value="boss">BOSS直聘</option>
          <option value="yupao">鱼泡直聘</option>
        </select>
      </label>
      <DescriptionStatusSelect
        value={props.descriptionStatus}
        onChanged={props.onDescriptionStatusChanged}
      />
      <button type="submit">搜索</button>
    </form>
  );
}

function DescriptionStatusSelect(props: {
  onChanged: (descriptionStatus: DescriptionStatusSelection) => void;
  value: DescriptionStatusSelection;
}): JSX.Element {
  return (
    <label>
      岗位详情
      <select
        value={props.value}
        onChange={(event) => {
          const { value } = event.currentTarget;
          props.onChanged(
            JobDescriptionStatusFilter.allows(value) ? value : allDescriptionStatuses,
          );
        }}
      >
        <option value={allDescriptionStatuses}>全部</option>
        <option value="missing">尚无详情</option>
        <option value="identity-unresolved">详情来源待补全</option>
        <option value="captured">已有详情</option>
      </select>
    </label>
  );
}

// eslint-disable-next-line max-lines-per-function -- One reactive owner keeps list filters, paging, and selection synchronized.
function createJobLibraryPageState(view: JobLibraryView) {
  const engagement = view === "all" ? null : view;
  const [draftQuery, setDraftQuery] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [platform, setPlatform] = createSignal(allPlatforms);
  const [descriptionStatus, setDescriptionStatus] =
    createSignal<DescriptionStatusSelection>(allDescriptionStatuses);
  const [page, setPage] = createSignal(firstPage);
  const [selectedJob, setSelectedJob] = createSignal<JobPosting | null>(null);
  const jobPage = createWorkspaceRead(() => {
    const selectedDescriptionStatus = descriptionStatus();
    return readJobPostingPage({
      ...(engagement ? { engagement } : {}),
      ...(selectedDescriptionStatus === allDescriptionStatuses
        ? {}
        : { descriptionStatus: selectedDescriptionStatus }),
      page: page(),
      pageSize,
      ...(platform() === allPlatforms ? {} : { platform: platform() }),
      ...(query() ? { query: query() } : {}),
    });
  }, refreshIntervalMilliseconds);
  function changeFilter(setter: (value: string) => void, value: string): void {
    setSelectedJob(null);
    setPage(firstPage);
    setter(value);
  }
  function changeDescriptionStatus(value: DescriptionStatusSelection): void {
    changeFilter(setDescriptionStatus, value);
  }
  function changePlatform(value: string): void {
    changeFilter(setPlatform, value);
  }
  function submitQuery(): void {
    setSelectedJob(null);
    setPage(firstPage);
    setQuery(draftQuery().trim());
  }
  function changePage(nextPage: number): void {
    setSelectedJob(null);
    setPage(nextPage);
  }
  return {
    changeDescriptionStatus,
    changePage,
    changePlatform,
    descriptionStatus,
    draftQuery,
    jobPage,
    platform,
    selectedJob,
    setDraftQuery,
    setSelectedJob,
    submitQuery,
  };
}

export function JobLibraryPage(props: { requestedEngagement: string | null }): JSX.Element {
  const view = readJobLibraryView(props.requestedEngagement);
  const state = createJobLibraryPageState(view);

  return (
    <AppShell active="jobs" title="岗位库" lede={jobLibraryLede}>
      <section class={styles["library"]} aria-labelledby="job-results-heading">
        <JobEngagementNavigation view={view} />
        <JobLibraryFilters
          descriptionStatus={state.descriptionStatus()}
          draftQuery={state.draftQuery()}
          onDescriptionStatusChanged={state.changeDescriptionStatus}
          platform={state.platform()}
          onPlatformChanged={state.changePlatform}
          onQueryChanged={state.setDraftQuery}
          onSubmitted={state.submitQuery}
        />
        <WorkspaceDataBoundary loading={<p class={styles["empty"]}>正在读取岗位…</p>}>
          <Show when={state.jobPage.data()}>
            {(result) => (
              <JobResults
                result={result()}
                view={view}
                onPageChanged={state.changePage}
                onShowDescription={state.setSelectedJob}
              />
            )}
          </Show>
        </WorkspaceDataBoundary>
      </section>
      <Show when={state.selectedJob()}>
        {(job) => <JobDescriptionDialog job={job()} onClose={() => state.setSelectedJob(null)} />}
      </Show>
    </AppShell>
  );
}
