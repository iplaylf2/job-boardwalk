import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import {
  parsePlatformJobEngagementUrl,
  resolvePlatformJobEngagementUrl,
} from "@job-boardwalk/platform-catalog";

import { capture51jobEngagementMetadata } from "#/browser/job-engagement/51job-page-capture.js";
import { jobEngagementSnapshotFromPageMetadata } from "#/browser/job-engagement/snapshot.js";
import { parse51jobEngagementTotal } from "#/browser/job-engagement/page-totals.js";
import { job51EvidenceConfig } from "#/browser/platforms/51job.js";

const firstIndex = 0;
const oneCard = 1;
const twoCards = 2;
const maximumCards = 60;
const capturedAt = "2026-08-02T00:00:00.000Z";
const appliedUrl = "https://i.51job.com/userset/my_apply.php?type=sh&tagType=&lang=c";
const interestedUrl = "https://www.51job.com/userset/my_collection";
const interviewedUrl = "https://i.51job.com/userset/my_apply.php?type=sh&tagType=ms&lang=c";
const detailUrl = "https://jobs.51job.com/synthetic-city/900000001.html";

function jobLinks(url: string, title = "合成系统工程师", company = "合成雇主甲") {
  const link = { href: url, parentElement: null as unknown, textContent: title };
  const companyLink = {
    href: "https://jobs.51job.com/all/coSYNTHETIC.html",
    parentElement: null as unknown,
    textContent: company,
  };
  const container = {
    innerText: `${title}\n8千-1.2万\n${company}\n合成市`,
    parentElement: null,
    querySelector: () => ({ textContent: "合成市" }),
    querySelectorAll: () => [link, companyLink],
  };
  link.parentElement = container;
  companyLink.parentElement = container;
  return [link, companyLink];
}

function capture(
  links: ReturnType<typeof jobLinks>,
  text: string,
  limit = maximumCards,
  url = appliedUrl,
) {
  return runInNewContext(`(${capture51jobEngagementMetadata.toString()})(input)`, {
    URL,
    document: {
      body: { innerText: text },
      querySelector: (selector: string) =>
        [".apox", ".m-collect"].includes(selector) ? { querySelectorAll: () => links } : null,
    },
    input: {
      jobLinkOrigins: job51EvidenceConfig.jobLinkOrigins,
      jobLinkPathPattern: job51EvidenceConfig.jobLinkPathPattern,
      maximumCards: limit,
      maximumSummaryCharacters: 1500,
      salaryTextPattern: job51EvidenceConfig.salaryTextPattern,
    },
    location: new URL(url),
  }) as ReturnType<typeof capture51jobEngagementMetadata>;
}

test.each([
  ["applied", appliedUrl],
  ["interested", interestedUrl],
  ["interviewed", interviewedUrl],
] as const)("owns the 51job %s category on its actual origin", (engagement, url) => {
  expect(resolvePlatformJobEngagementUrl("51job", engagement)).toBe(url);
  expect(parsePlatformJobEngagementUrl("51job", url)).toBe(engagement);
});

test.each([
  "https://i.51job.com/userset/my_apply.php?type=sh&tagType=xq&lang=c",
  "https://i.51job.com/userset/my_apply.php?type=sh&tagType=cy&lang=c",
  "https://www.51job.com/userset/my_apply.php?type=sh&tagType=&lang=c",
  "https://i.51job.com/userset/my_collection",
])("does not misclassify employer feedback or another host as a category: %s", (url) => {
  expect(parsePlatformJobEngagementUrl("51job", url)).toBeNull();
});

test.each([
  ["applied", appliedUrl, "社会申请 4"],
  ["interested", interestedUrl, "职位收藏4"],
] as const)(
  "captures linked %s jobs and excludes incomplete or foreign evidence",
  (engagement, url, text) => {
    const metadata = capture(
      [
        ...jobLinks(detailUrl),
        ...jobLinks("https://jobs.51job.com/all/900000001.html?tracking=synthetic"),
        ...jobLinks("https://evil.invalid/synthetic-city/900000002.html"),
        ...jobLinks("https://jobs.51job.com/synthetic-city/900000003.html", "合成分析师", ""),
      ],
      text,
      maximumCards,
      url,
    );
    expect(metadata.jobs).toHaveLength(oneCard);
    expect(metadata.jobs[firstIndex]).toMatchObject({
      company: "合成雇主甲",
      jobUrl: detailUrl,
      location: "合成市",
      salaryText: "8千-1.2万",
      title: "合成系统工程师",
    });
    const snapshot = jobEngagementSnapshotFromPageMetadata(
      metadata,
      capturedAt,
      engagement,
      "51job",
    );
    expect(snapshot).toMatchObject({
      complete: false,
      jobs: [{ externalJobId: "900000001" }],
      total: 4,
    });
  },
);

test("reports complete and bounded partial application evidence separately", () => {
  const links = [
    ...jobLinks(detailUrl),
    ...jobLinks("https://jobs.51job.com/synthetic-city/900000004.html", "合成分析师"),
  ];
  expect(
    jobEngagementSnapshotFromPageMetadata(
      capture(links, "社会申请 2"),
      capturedAt,
      "applied",
      "51job",
    ),
  ).toMatchObject({ complete: true, total: twoCards });
  expect(
    jobEngagementSnapshotFromPageMetadata(
      capture(links, "社会申请 2", oneCard),
      capturedAt,
      "applied",
      "51job",
    ),
  ).toMatchObject({ complete: false, total: twoCards });
});

test.each([
  ["interested", interestedUrl, "职位收藏0\n暂无收藏记录"],
  ["interviewed", interviewedUrl, "社会申请 7\n暂无HR邀你参加面试，看看为你推荐的职位"],
] as const)(
  "recognizes the explicit empty %s state without borrowing another category's count",
  (engagement, url, text) => {
    expect(
      jobEngagementSnapshotFromPageMetadata(
        capture([], text, maximumCards, url),
        capturedAt,
        engagement,
        "51job",
      ),
    ).toMatchObject({ complete: true, jobs: [], total: 0 });
  },
);

test.each(["职位收藏0", "职位收藏5", "加载中", "社会申请 7\n感兴趣"])(
  "does not clear favorites after an unconfirmed or unrecognized list: %s",
  (text) => {
    expect(() =>
      jobEngagementSnapshotFromPageMetadata(
        capture([], text, maximumCards, interestedUrl),
        capturedAt,
        "interested",
        "51job",
      ),
    ).toThrow();
  },
);

test("never borrows all-application or employer-interest counts for invitations", () => {
  expect(parse51jobEngagementTotal("社会申请 7\n感兴趣 5\n邀面试", "interviewed")).toBeNull();
  expect(parse51jobEngagementTotal("社会申请 7\n感兴趣 5", "interested")).toBeNull();
  const metadata = capture(jobLinks(detailUrl), "社会申请 7\n邀面试", maximumCards, interviewedUrl);
  expect(
    jobEngagementSnapshotFromPageMetadata(metadata, capturedAt, "interviewed", "51job"),
  ).toMatchObject({ complete: false, completionTotal: null });
});
