import { expect, test } from "vitest";

import { normalizeJobPostingSalary } from "#/job-posting/salary.js";

test.each([
  [
    "20-30K·13薪",
    {
      currency: "CNY",
      maximumK: 30,
      minimumK: 20,
      monthsPerYear: 13,
      period: "month",
    },
  ],
  [
    "1.5-2.5万元/月",
    {
      currency: "CNY",
      maximumK: 25,
      minimumK: 15,
      period: "month",
    },
  ],
  [
    "5000-7000元/月",
    {
      currency: "CNY",
      maximumK: 7,
      minimumK: 5,
      period: "month",
    },
  ],
  [
    "300-400元/天",
    {
      currency: "CNY",
      maximumK: 0.4,
      minimumK: 0.3,
      period: "day",
    },
  ],
  [
    "20-30万元/年",
    {
      currency: "CNY",
      maximumK: 300,
      minimumK: 200,
      period: "year",
    },
  ],
])("normalizes %s without inventing a work schedule", (salaryText, expected) => {
  expect(normalizeJobPostingSalary(salaryText)).toEqual(expected);
});

test("keeps negotiated and unknown salary text unnormalized", () => {
  expect(normalizeJobPostingSalary("面议")).toBeNull();
  expect(normalizeJobPostingSalary("项目提成")).toBeNull();
});
