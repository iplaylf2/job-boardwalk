import { expect, test } from "vitest";

import { parseJobPostingSalary } from "#/job-library/salary.js";

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
  expect(parseJobPostingSalary(salaryText)).toEqual(expected);
});

test("keeps negotiated and unknown salary text unnormalized", () => {
  expect(parseJobPostingSalary("面议")).toBeNull();
  expect(parseJobPostingSalary("项目提成")).toBeNull();
});

test.each([
  ["8千-1.2万·13薪", { maximumK: 12, minimumK: 8, monthsPerYear: 13, period: "month" }],
  ["6-9千", { maximumK: 9, minimumK: 6, period: "month" }],
  ["2.5-3.5万·14薪", { maximumK: 35, minimumK: 25, monthsPerYear: 14, period: "month" }],
  ["16-22万/年", { maximumK: 220, minimumK: 160, period: "year" }],
  ["1万", { minimumK: 10, period: "month" }],
])("normalizes 51job salary notation %s", (text, expected) => {
  expect(parseJobPostingSalary(text)).toEqual({ currency: "CNY", ...expected });
});

test.each(["8千-万", "8千-1.2", "8千万", "16-22万/年·13薪", "8千起另有提成"])(
  "leaves ambiguous or malformed salary notation unnormalized: %s",
  (text) => {
    expect(parseJobPostingSalary(text)).toBeNull();
  },
);
