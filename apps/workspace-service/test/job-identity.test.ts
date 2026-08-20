import { expect, test } from "vitest";

import {
  jobPostingIdentityKey,
  jobPostingIdentityKeyFromSources,
  jobPostingSourceIdentityKey,
} from "#/job-library/identity.js";

const earlierObservation = "2026-07-19T10:00:00.000Z";
const laterObservation = "2026-07-19T10:05:00.000Z";

test("normalizes complete cross-platform evidence to one job identity", () => {
  const boss = {
    company: "合成归并甲有限公司",
    externalJobId: "boss-role",
    location: "北京 · 合成区",
    observedAt: earlierObservation,
    platformId: "boss" as const,
    title: "平台工程师",
  };
  const yupao = {
    company: "合成归并甲有限公司",
    externalJobId: "yupao-role",
    location: "北京合成区",
    observedAt: laterObservation,
    platformId: "yupao" as const,
    title: "平台 工程师",
  };

  expect(jobPostingIdentityKey(boss)).toBe(jobPostingIdentityKey(yupao));
  expect(jobPostingSourceIdentityKey(boss)).not.toBe(jobPostingSourceIdentityKey(yupao));
});

test("does not infer company aliases or discard title phrases", () => {
  const evidence = {
    company: "合成归并甲有限公司",
    location: "北京合成区",
    observedAt: earlierObservation,
    platformId: "boss" as const,
    title: "平台工程师",
  };

  expect(jobPostingIdentityKey(evidence)).not.toBe(
    jobPostingIdentityKey({ ...evidence, company: "合成归并甲" }),
  );
  expect(jobPostingIdentityKey(evidence)).not.toBe(
    jobPostingIdentityKey({ ...evidence, title: "【急聘】平台工程师" }),
  );
});

test("keeps partial cross-platform evidence under separate source identities", () => {
  const evidence = {
    observedAt: earlierObservation,
    title: "合成平台工程师",
  };

  expect(jobPostingIdentityKey({ ...evidence, platformId: "boss" })).not.toBe(
    jobPostingIdentityKey({ ...evidence, platformId: "yupao" }),
  );
});

test("derives a normalized job identity from its latest retained source evidence", () => {
  const earlier = {
    company: "合成旧称甲",
    location: "北京旧址",
    observedAt: earlierObservation,
    platformId: "boss" as const,
    title: "合成平台工程师",
  };
  const later = {
    company: "合成新称乙",
    location: "上海新址",
    observedAt: laterObservation,
    platformId: "yupao" as const,
    title: "合成平台工程师",
  };

  expect(jobPostingIdentityKeyFromSources([later, earlier])).toBe(jobPostingIdentityKey(later));
});
