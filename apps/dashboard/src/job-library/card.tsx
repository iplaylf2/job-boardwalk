import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobPosting, NormalizedSalary } from "@job-boardwalk/contracts";
import { platformCatalog } from "@job-boardwalk/platform-catalog";

import { jobEngagementLabels } from "./engagement.js";
import styles from "./card.module.css";

const emptyCollectionLength = 0;
const lastCollectionIndex = -1;

function formattedDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function salaryRange(salary: NormalizedSalary): string {
  const minimum = String(salary.minimumK);
  return typeof salary.maximumK === "number" && salary.maximumK !== salary.minimumK
    ? `${minimum}–${String(salary.maximumK)}K`
    : `${minimum}K`;
}

function formattedSalary(source: JobPosting["sources"][number]): string | null {
  const salary = source.normalizedSalary;
  if (!salary) {
    return source.salaryText ?? null;
  }
  const periodLabels = { day: "天", hour: "小时", month: "月", year: "年" } as const;
  const base = `${salaryRange(salary)}/${periodLabels[salary.period]}`;
  return salary.period === "month" && typeof salary.monthsPerYear === "number"
    ? `${base} · ${String(salary.monthsPerYear)}薪`
    : base;
}

function displaySalary(job: JobPosting): string | null {
  for (const source of job.sources) {
    const salary = formattedSalary(source);
    if (salary) {
      return salary;
    }
  }
  return null;
}

function JobSourceLinks(props: { job: JobPosting }): JSX.Element {
  return (
    <div class={styles["sources"]}>
      <For each={props.job.sources}>
        {(source) => {
          const engagementText = source.engagements
            .map(({ kind }) => jobEngagementLabels[kind])
            .join(" · ");
          const label = `${platformCatalog[source.platformId].label}${
            engagementText ? ` · ${engagementText}` : ""
          }`;
          return source.jobUrl ? (
            <a href={source.jobUrl} target="_blank" rel="noreferrer">
              {label}
            </a>
          ) : (
            <span>{label}</span>
          );
        }}
      </For>
    </div>
  );
}

function JobDescription(props: {
  description: NonNullable<JobPosting["description"]>;
}): JSX.Element {
  return (
    <details class={styles["description"]}>
      <summary>
        职位描述
        {props.description.truncated ? "（采集文本已截断）" : ""}
      </summary>
      <p>{props.description.text}</p>
    </details>
  );
}

export function JobCard(props: { job: JobPosting }): JSX.Element {
  const salary = displaySalary(props.job);
  const latestEngagementAt = props.job.sources
    .flatMap((source) => source.engagements.map(({ lastObservedAt }) => lastObservedAt))
    .toSorted()
    .at(lastCollectionIndex);

  return (
    <article class={styles["card"]}>
      <header>
        <div>
          <Show when={props.job.company}>
            {(company) => <span class={styles["company"]}>{company()}</span>}
          </Show>
          <h3>{props.job.title}</h3>
        </div>
      </header>
      <div class={styles["primaryFacts"]}>
        <Show when={salary}>{(value) => <strong class={styles["salary"]}>{value()}</strong>}</Show>
        <Show when={props.job.location}>{(location) => <span>{location()}</span>}</Show>
        <Show when={props.job.experienceRequirement}>
          {(experience) => <span>{experience()}</span>}
        </Show>
        <Show when={props.job.educationRequirement}>
          {(education) => <span>{education()}</span>}
        </Show>
      </div>
      <Show when={props.job.details.length !== emptyCollectionLength}>
        <div class={styles["details"]}>
          <For each={props.job.details}>{(detail) => <span>{detail}</span>}</For>
        </div>
      </Show>
      <Show when={props.job.description}>
        {(description) => <JobDescription description={description()} />}
      </Show>
      <footer>
        <JobSourceLinks job={props.job} />
        <span>
          {latestEngagementAt
            ? `平台记录同步于 ${formattedDate(latestEngagementAt)}`
            : `更新于 ${formattedDate(props.job.updatedAt)}`}
        </span>
      </footer>
    </article>
  );
}
