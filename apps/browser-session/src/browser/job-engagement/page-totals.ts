import type { PlatformJobEngagementKind as JobEngagementKind } from "@job-boardwalk/platform-catalog";

const emptyCategoryCount = 0;

export function parseJobEngagementTotal(
  text: string,
  engagement: JobEngagementKind,
): number | null {
  const patterns = {
    applied: /累计投递简历数量\s*(?<total>\d+)/u,
    contacted: /累计沟通职位数量\s*(?<total>\d+)/u,
    interested: /感兴趣\s*(?<total>\d+)/u,
    interviewed: /面试\s*(?<total>\d+)/u,
  } as const;
  const match = patterns[engagement].exec(text);
  return match?.groups?.["total"] ? Number(match.groups["total"]) : null;
}

export function parse51jobEngagementTotal(
  text: string,
  engagement: JobEngagementKind,
): number | null {
  if (engagement === "interviewed") {
    return /^暂无HR邀你参加面试[，,]/mu.test(text) ? emptyCategoryCount : null;
  }
  const patterns = {
    applied: /^社会申请\s*(?<total>\d+)\s*$/mu,
    contacted: null,
    interested: /^职位收藏\s*(?<total>\d+)\s*$/mu,
  };
  const pattern = patterns[engagement];
  const total = pattern?.exec(text)?.groups?.["total"];
  if (!total) {
    return null;
  }
  const count = Number(total);
  if (
    count === emptyCategoryCount &&
    !(engagement === "interested" && /^暂无收藏记录$/mu.test(text))
  ) {
    return null;
  }
  return count;
}
