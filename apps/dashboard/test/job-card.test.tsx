import { renderToString } from "@solidjs/web";
import type { JobPosting } from "@job-boardwalk/contracts";
import { expect, test } from "vitest";

import { JobCard } from "#/job-library/card.js";

const baseSource = {
  descriptionCaptureStatus: "uncaptured",
  details: ["合成业务"],
  discoveryUrl: "https://www.zhipin.com/web/geek/job",
  engagements: [],
  id: 1,
  jobId: 1,
  lastCheckedAt: "2026-08-19T01:00:00.000Z",
  observedAt: "2026-08-19T01:00:00.000Z",
  platformId: "boss",
  summary: "尚未采集详情的合成岗位",
  title: "合成系统工程师",
} satisfies JobPosting["sources"][number];

const baseJob = {
  company: "合成星河技术公司",
  createdAt: "2026-08-19T01:00:00.000Z",
  details: ["合成业务"],
  id: 1,
  sources: [baseSource],
  summary: "尚未采集详情的合成岗位",
  title: "合成系统工程师",
  updatedAt: "2026-08-19T01:00:00.000Z",
} satisfies JobPosting;

test.each(["uncaptured", "identity-unresolved"] as const)(
  "does not offer a description action for %s evidence",
  (status) => {
    const job: JobPosting = {
      ...baseJob,
      sources: [{ ...baseSource, descriptionCaptureStatus: status }],
    };
    const html = renderToString(() => <JobCard job={job} onShowDescription={() => null} />);

    expect(html).not.toContain("<button");
  },
);

test("offers the description action only when a retained description exists", () => {
  const capturedJob: JobPosting = {
    ...baseJob,
    description: {
      capturedAt: "2026-08-19T02:00:00.000Z",
      text: "负责维护合成业务系统。",
      truncated: false,
    },
    sources: [{ ...baseSource, descriptionCaptureStatus: "captured" }],
  };
  const html = renderToString(() => <JobCard job={capturedJob} onShowDescription={() => null} />);

  expect(html).toContain('aria-haspopup="dialog"');
});
