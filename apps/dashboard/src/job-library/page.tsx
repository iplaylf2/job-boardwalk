import { createMemo, createSignal, For, Loading, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobPostingPage } from "@job-boardwalk/contracts";

import { AppShell } from "#/app-shell.js";
import { SectionKicker } from "#/ui/section-kicker.js";
import { readJobPostingPage } from "#/workspace-service-client.js";

import { JobCard } from "./card.js";
import styles from "./page.module.css";

const allPlatforms = "all";
const emptyCollectionLength = 0;
const firstPage = 1;
const initialRefreshCount = 0;
const pageSize = 24;
const refreshIncrement = 1;
const refreshIntervalMilliseconds = 30_000;

type JobLibrarySlice = "all" | "interested";

const jobLibraryPageCopy = {
  all: {
    active: "jobs",
    empty: "没有找到符合条件的岗位。可以调整关键词或平台。",
    kicker: "已整理岗位",
    lede: "查看研究过程中发现并整理的岗位，通过原始链接回到招聘平台核对。",
    title: "岗位库",
  },
  interested: {
    active: "interested-jobs",
    empty: "没有找到符合当前筛选条件的“感兴趣”岗位。可以调整筛选，或在招聘平台标记岗位后等待同步。",
    kicker: "平台标记",
    lede: "查看已在招聘平台标记为“感兴趣”的岗位；这些岗位仍属于同一个岗位库。",
    title: "感兴趣",
  },
} as const;

function isInterestedSlice(slice: JobLibrarySlice): boolean {
  return slice === "interested";
}

function usePeriodicRefresh(onRefresh: () => void): void {
  onSettled(() => {
    const interval = setInterval(onRefresh, refreshIntervalMilliseconds);
    return () => clearInterval(interval);
  });
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
  slice: JobLibrarySlice;
}): JSX.Element {
  const copy = jobLibraryPageCopy[props.slice];
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
          onClick={() => props.onPageChanged(props.result.page - refreshIncrement)}
        >
          上一页
        </button>
        <span>
          第 {String(props.result.page)} / {String(props.result.pageCount)} 页
        </span>
        <button
          type="button"
          disabled={props.result.page >= props.result.pageCount}
          onClick={() => props.onPageChanged(props.result.page + refreshIncrement)}
        >
          下一页
        </button>
      </nav>
    </>
  );
}

export function JobLibraryPage(props: { slice: JobLibrarySlice }): JSX.Element {
  const pageCopy = jobLibraryPageCopy[props.slice];
  const interestedOnly = isInterestedSlice(props.slice);
  const [draftQuery, setDraftQuery] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [platform, setPlatform] = createSignal(allPlatforms);
  const [page, setPage] = createSignal(firstPage);
  const [refreshCount, setRefreshCount] = createSignal(initialRefreshCount);
  const jobPage = createMemo(() => {
    refreshCount();
    return readJobPostingPage({
      ...(interestedOnly ? { interestedOnly: true } : {}),
      page: page(),
      pageSize,
      ...(platform() === allPlatforms ? {} : { platform: platform() }),
      ...(query() ? { query: query() } : {}),
    });
  });
  usePeriodicRefresh(() => setRefreshCount((value) => value + refreshIncrement));
  function changePlatform(value: string): void {
    setPage(firstPage);
    setPlatform(value);
  }
  function submitQuery(): void {
    setPage(firstPage);
    setQuery(draftQuery().trim());
  }

  return (
    <AppShell active={pageCopy.active} title={pageCopy.title} lede={pageCopy.lede}>
      <section class={styles["library"]} aria-labelledby="job-results-heading">
        <JobLibraryFilters
          draftQuery={draftQuery()}
          platform={platform()}
          onPlatformChanged={changePlatform}
          onQueryChanged={setDraftQuery}
          onSubmitted={submitQuery}
        />
        <Loading fallback={<p class={styles["empty"]}>正在读取岗位…</p>}>
          <Show when={jobPage()}>
            {(result) => (
              <JobResults result={result()} slice={props.slice} onPageChanged={setPage} />
            )}
          </Show>
        </Loading>
      </section>
    </AppShell>
  );
}
