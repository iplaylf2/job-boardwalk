import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobPostingPage } from "@job-boardwalk/contracts";

import { AppShell } from "#/app-shell.js";
import { SectionKicker } from "#/ui/section-kicker.js";
import { WorkspaceDataBoundary } from "#/workspace-data-boundary.js";
import { createWorkspaceRead } from "#/workspace-read.js";
import { readJobPostingPage } from "#/workspace-service-client.js";

import { JobCard } from "./card.js";
import { jobLibraryViewLabel, jobLibraryViews, readJobLibraryView } from "./engagement.js";
import type { JobLibraryView } from "./engagement.js";
import styles from "./page.module.css";

const allPlatforms = "all";
const emptyCollectionLength = 0;
const firstPage = 1;
const jobLibraryLede = "集中查看已收录岗位，并按感兴趣、沟通过、已投递等平台记录筛选。";
const pageStep = 1;
const pageSize = 24;
const refreshIntervalMilliseconds = 30_000;

const jobLibraryPageCopy = {
  all: {
    empty: "没有找到符合条件的岗位。可以调整关键词或平台。",
    kicker: "已整理岗位",
  },
  applied: {
    empty: "尚未从招聘平台个人中心同步到“已投递”岗位。",
    kicker: "岗位跟进",
  },
  contacted: {
    empty: "尚未从招聘平台个人中心同步到“沟通过”岗位。",
    kicker: "岗位跟进",
  },
  interested: {
    empty: "尚未从招聘平台个人中心同步到“感兴趣”岗位。你可以在平台标记岗位，再让助手同步该列表。",
    kicker: "岗位跟进",
  },
  interviewed: {
    empty: "尚未从招聘平台个人中心同步到面试岗位。",
    kicker: "岗位跟进",
  },
} as const;

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
  draftQuery: string;
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
      <button type="submit">搜索</button>
    </form>
  );
}

function JobResults(props: {
  onPageChanged: (page: number) => void;
  result: JobPostingPage;
  view: JobLibraryView;
}): JSX.Element {
  const copy = jobLibraryPageCopy[props.view];
  return (
    <>
      <div class={styles["heading"]}>
        <div>
          <SectionKicker>{copy.kicker}</SectionKicker>
          <h2 id="job-results-heading">岗位列表</h2>
        </div>
        <span class={styles["count"]}>{String(props.result.total)} 个岗位</span>
      </div>
      <Show
        when={props.result.jobs.length !== emptyCollectionLength}
        fallback={<p class={styles["empty"]}>{copy.empty}</p>}
      >
        <div class={styles["grid"]}>
          <For each={props.result.jobs}>{(job) => <JobCard job={job} />}</For>
        </div>
      </Show>
      <nav class={styles["pagination"]} aria-label="岗位页码">
        <button
          type="button"
          disabled={props.result.page === firstPage}
          onClick={() => props.onPageChanged(props.result.page - pageStep)}
        >
          上一页
        </button>
        <span>
          第 {String(props.result.page)} / {String(props.result.pageCount)} 页
        </span>
        <button
          type="button"
          disabled={props.result.page >= props.result.pageCount}
          onClick={() => props.onPageChanged(props.result.page + pageStep)}
        >
          下一页
        </button>
      </nav>
    </>
  );
}

export function JobLibraryPage(props: { requestedEngagement: string | null }): JSX.Element {
  const view = readJobLibraryView(props.requestedEngagement);
  const engagement = view === "all" ? null : view;
  const [draftQuery, setDraftQuery] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [platform, setPlatform] = createSignal(allPlatforms);
  const [page, setPage] = createSignal(firstPage);
  const jobPage = createWorkspaceRead(
    () =>
      readJobPostingPage({
        ...(engagement ? { engagement } : {}),
        page: page(),
        pageSize,
        ...(platform() === allPlatforms ? {} : { platform: platform() }),
        ...(query() ? { query: query() } : {}),
      }),
    refreshIntervalMilliseconds,
  );
  function changePlatform(value: string): void {
    setPage(firstPage);
    setPlatform(value);
  }
  function submitQuery(): void {
    setPage(firstPage);
    setQuery(draftQuery().trim());
  }

  return (
    <AppShell active="jobs" title="岗位库" lede={jobLibraryLede}>
      <section class={styles["library"]} aria-labelledby="job-results-heading">
        <JobEngagementNavigation view={view} />
        <JobLibraryFilters
          draftQuery={draftQuery()}
          platform={platform()}
          onPlatformChanged={changePlatform}
          onQueryChanged={setDraftQuery}
          onSubmitted={submitQuery}
        />
        <WorkspaceDataBoundary loading={<p class={styles["empty"]}>正在读取岗位…</p>}>
          <Show when={jobPage.data()}>
            {(result) => <JobResults result={result()} view={view} onPageChanged={setPage} />}
          </Show>
        </WorkspaceDataBoundary>
      </section>
    </AppShell>
  );
}
