import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobPosting, NormalizedSalary } from "@job-boardwalk/contracts";

const emptyCollectionLength = 0;

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

function displaySalary(job: JobPosting): string {
  for (const source of job.sources) {
    const salary = formattedSalary(source);
    if (salary) {
      return salary;
    }
  }
  return "薪资待补充";
}

function displaySummary(job: JobPosting): string | null {
  let summary = job.summary.trim();
  const removablePrefixes = [
    job.title,
    ...job.sources.flatMap((source) => [
      source.title,
      source.salaryText ?? "",
      source.experienceRequirement ?? "",
      source.educationRequirement ?? "",
      ...source.details,
    ]),
  ].filter(Boolean);

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of removablePrefixes) {
      if (summary.startsWith(prefix)) {
        summary = summary.slice(prefix.length).trim();
        changed = true;
      }
    }
  }

  return summary.length > emptyCollectionLength && summary !== job.title ? summary : null;
}

export function JobCard(props: { job: JobPosting }): JSX.Element {
  const summary = displaySummary(props.job);

  return (
    <article class="job-card">
      <header>
        <div>
          <span class="job-company">{props.job.company ?? "公司信息待补充"}</span>
          <h3>{props.job.title}</h3>
        </div>
      </header>
      <div class="job-primary-facts">
        <strong class="job-salary">{displaySalary(props.job)}</strong>
        <Show when={props.job.location}>{(location) => <span>{location()}</span>}</Show>
        <Show when={props.job.experienceRequirement}>
          {(experience) => <span>{experience()}</span>}
        </Show>
        <Show when={props.job.educationRequirement}>
          {(education) => <span>{education()}</span>}
        </Show>
      </div>
      <Show when={summary}>{(text) => <p class="job-summary">{text()}</p>}</Show>
      <Show when={props.job.details.length !== emptyCollectionLength}>
        <div class="job-details">
          <For each={props.job.details}>{(detail) => <span>{detail}</span>}</For>
        </div>
      </Show>
      <footer>
        <div class="job-sources">
          <For each={props.job.sources}>
            {(source) => (
              <a href={source.jobUrl} target="_blank" rel="noreferrer">
                {source.platformId === "boss" ? "BOSS直聘" : "鱼泡直聘"}
                {formattedSalary(source) ? ` · ${formattedSalary(source)}` : ""}
              </a>
            )}
          </For>
        </div>
        <span>更新于 {formattedDate(props.job.updatedAt)}</span>
      </footer>
    </article>
  );
}
