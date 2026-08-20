import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobPosting, JobPostingPage } from "@job-boardwalk/contracts";

import { SectionKicker } from "#/ui/section-kicker.js";

import { JobCard } from "./card.js";
import type { JobLibraryView } from "./engagement.js";
import styles from "./page.module.css";

const emptyCollectionLength = 0;
const firstPage = 1;
const pageStep = 1;

const jobLibraryResultCopy = {
  all: {
    empty: "岗位库里还没有岗位。完成招聘平台研究后，收录结果会显示在这里。",
    kicker: "已整理岗位",
  },
  applied: {
    empty: "尚未从招聘平台个人中心同步“已投递”岗位。",
    kicker: "岗位跟进",
  },
  contacted: {
    empty: "尚未从招聘平台个人中心同步“沟通过”岗位。",
    kicker: "岗位跟进",
  },
  interested: {
    empty: "尚未从招聘平台个人中心同步“感兴趣”岗位。你可以先在平台标记感兴趣，再让助手同步。",
    kicker: "岗位跟进",
  },
  interviewed: {
    empty: "尚未从招聘平台个人中心同步“面试”岗位。",
    kicker: "岗位跟进",
  },
  tracked: {
    empty: "尚未从招聘平台个人中心同步任何跟进岗位。",
    kicker: "岗位跟进",
  },
} as const;

const filteredEmptyResult = "没有找到符合当前筛选条件的岗位。可以调整关键词或筛选条件。";

function JobDescriptionCoverageSummary(props: { result: JobPostingPage }): JSX.Element {
  const missing =
    props.result.descriptionCoverage.uncaptured +
    props.result.descriptionCoverage.identityUnresolved;
  return (
    <span class={styles["count"]}>
      共 {String(props.result.descriptionCoverage.total)} 个岗位 · 职位描述：
      {String(props.result.descriptionCoverage.captured)} 个已采集 · {String(missing)} 个未采集
      <Show when={props.result.descriptionCoverage.identityUnresolved > emptyCollectionLength}>
        {`（其中 ${String(props.result.descriptionCoverage.identityUnresolved)} 个还需补全详情来源）`}
      </Show>
      <Show when={props.result.total !== props.result.descriptionCoverage.total}>
        {` · 当前显示 ${String(props.result.total)} 个`}
      </Show>
    </span>
  );
}

export function JobResults(props: {
  hasNarrowingFilters: boolean;
  onPageChanged: (page: number) => void;
  onShowDescription: (job: JobPosting) => void;
  result: JobPostingPage;
  view: JobLibraryView;
}): JSX.Element {
  const copy = jobLibraryResultCopy[props.view];
  const emptyResult = props.hasNarrowingFilters ? filteredEmptyResult : copy.empty;
  return (
    <>
      <div class={styles["heading"]}>
        <div>
          <SectionKicker>{copy.kicker}</SectionKicker>
          <h2 id="job-results-heading">岗位列表</h2>
        </div>
        <JobDescriptionCoverageSummary result={props.result} />
      </div>
      <Show
        when={props.result.jobs.length !== emptyCollectionLength}
        fallback={<p class={styles["empty"]}>{emptyResult}</p>}
      >
        <div class={styles["grid"]}>
          <For each={props.result.jobs}>
            {(job) => <JobCard job={job} onShowDescription={props.onShowDescription} />}
          </For>
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
