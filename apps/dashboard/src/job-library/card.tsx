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

export function JobCard(props: { job: JobPosting }): JSX.Element {
  return (
    <article class="job-card">
      <header>
        <div>
          <Show when={props.job.company}>
            {(company) => <span class="job-company">{company()}</span>}
          </Show>
          <h3>{props.job.title}</h3>
        </div>
      </header>
      <Show when={props.job.location}>
        {(location) => <p class="job-location">{location()}</p>}
      </Show>
      <Show when={props.job.experienceRequirement || props.job.educationRequirement}>
        <p class="job-requirements">
          {[props.job.experienceRequirement, props.job.educationRequirement]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Show>
      <p class="job-summary">{props.job.summary}</p>
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
