import type { NormalizedSalary } from "@job-boardwalk/contracts";

const chineseTenThousandsToK = 10;
const unitScale = 1;
const yuanToK = 1000;

function range(
  match: RegExpExecArray,
  scale: number,
): Pick<NormalizedSalary, "maximumK" | "minimumK"> {
  const minimumK = Number(match.groups?.["minimum"] ?? "") * scale;
  const maximum = match.groups?.["maximum"];
  return {
    ...(maximum ? { maximumK: Number(maximum) * scale } : {}),
    minimumK,
  };
}

function monthlySalary(match: RegExpExecArray, scale: number): NormalizedSalary {
  const explicitMonths = match.groups?.["months"];
  return {
    currency: "CNY",
    ...range(match, scale),
    ...(explicitMonths ? { monthsPerYear: Number(explicitMonths) } : {}),
    period: "month",
  };
}

function normalizeMonthly(compact: string): NormalizedSalary | null {
  const monthlyK =
    /^(?<minimum>\d+(?:\.\d+)?)(?:-(?<maximum>\d+(?:\.\d+)?))?K(?:\/月)?(?:·(?<months>\d+)薪)?$/iu.exec(
      compact,
    );
  if (monthlyK) {
    return monthlySalary(monthlyK, unitScale);
  }
  return null;
}

function normalizeYuanPeriod(compact: string): NormalizedSalary | null {
  const match =
    /^(?<minimum>\d+(?:\.\d+)?)(?:-(?<maximum>\d+(?:\.\d+)?))?元\/(?<period>月|天|小时)$/u.exec(
      compact,
    );
  if (!match) {
    return null;
  }
  const sourcePeriod = match.groups?.["period"];
  let period: NormalizedSalary["period"] = "hour";
  if (sourcePeriod === "月") {
    period = "month";
  } else if (sourcePeriod === "天") {
    period = "day";
  }
  return {
    currency: "CNY",
    ...range(match, unitScale / yuanToK),
    period,
  };
}

function normalizeChineseRange(compact: string): NormalizedSalary | null {
  const match =
    /^(?<minimum>\d+(?:\.\d+)?)(?:(?:(?<minimumUnit>千|万)(?:元)?)?-(?<maximum>\d+(?:\.\d+)?))?(?<unit>千|万)(?:元)?(?:\/(?<period>月|年))?(?:·(?<months>\d+)薪)?$/u.exec(
      compact,
    );
  if (!match?.groups) {
    return null;
  }
  const { minimum, maximum, minimumUnit, unit, period, months } = match.groups;
  if (period === "年" && months) {
    return null;
  }
  const minimumScale = (minimumUnit ?? unit) === "万" ? chineseTenThousandsToK : unitScale;
  const maximumScale = unit === "万" ? chineseTenThousandsToK : unitScale;
  return {
    currency: "CNY",
    ...(maximum ? { maximumK: Number(maximum) * maximumScale } : {}),
    minimumK: Number(minimum) * minimumScale,
    ...(months ? { monthsPerYear: Number(months) } : {}),
    period: period === "年" ? "year" : "month",
  };
}

export function parseJobPostingSalary(salaryText: string | undefined): NormalizedSalary | null {
  if (!salaryText || salaryText.includes("面议")) {
    return null;
  }
  const compact = salaryText.replaceAll(/\s+/gu, "");
  return (
    normalizeMonthly(compact) ?? normalizeYuanPeriod(compact) ?? normalizeChineseRange(compact)
  );
}
