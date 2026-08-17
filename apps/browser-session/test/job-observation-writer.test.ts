import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { WorkspaceJobObservationWriter } from "#/workspace-service/job-observation-writer.js";

const firstRequestIndex = 0;
const secondRequestIndex = 1;
const savedObservation = {
  job: {
    createdAt: "2026-07-17T10:00:00.000Z",
    details: ["Node.js"],
    id: 1,
    sources: [
      {
        company: "示例科技甲",
        details: ["Node.js"],
        discoveryUrl: "https://www.zhipin.com/job_detail/example.html",
        engagements: [],
        id: 1,
        jobId: 1,
        jobUrl: "https://www.zhipin.com/job_detail/example.html",
        lastCheckedAt: "2026-07-17T10:05:00.000Z",
        observedAt: "2026-07-17T10:05:00.000Z",
        platformId: "boss",
        summary: "建设合成测试平台。",
        title: "后端开发",
      },
    ],
    summary: "建设合成测试平台。",
    title: "后端开发",
    updatedAt: "2026-07-17T10:05:00.000Z",
  },
  outcome: "source-updated",
} as const;

test("preserves the caller's attribution when writing job observations", async () => {
  const requests: { input: string | URL | Request; init?: RequestInit }[] = [];
  const writer = new WorkspaceJobObservationWriter(
    new URL("http://workspace.test:54310"),
    (input, init) => {
      requests.push({ input, ...(init ? { init } : {}) });
      return Promise.resolve(Response.json(savedObservation, { status: 201 }));
    },
  );
  await using scope = createScope();

  const cardResult = await scope.run(() =>
    writer.writeCardObservation(
      {
        company: "示例科技甲",
        details: ["Node.js"],
        discoveryUrl: "https://www.zhipin.com/web/geek/jobs",
        jobUrl: "https://www.zhipin.com/job_detail/example.html",
        location: "北京",
        observedAt: "2026-07-17T10:00:00.000Z",
        platformId: "boss",
        salaryText: "20-30K",
        summary: "负责后端服务开发。",
        title: "后端开发",
      },
      {
        initiatedBy: "system",
        reason: "Browser Session 被动采集当前页面已展示的岗位证据",
      },
    ),
  );
  const descriptionResult = await scope.run(() =>
    writer.writeDescriptionObservation(
      {
        description: {
          capturedAt: "2026-07-17T10:05:00.000Z",
          text: "建设合成测试平台。",
          truncated: false,
        },
        details: [],
        jobUrl: "https://www.zhipin.com/job_detail/example.html",
        observedAt: "2026-07-17T10:05:00.000Z",
        platformId: "boss",
        title: "后端开发",
      },
      {
        initiatedBy: "agent",
        reason: "Agent 显式采集当前页面的岗位详情证据",
      },
    ),
  );

  expect(String(requests[firstRequestIndex]?.input)).toBe(
    "http://workspace.test:54310/api/job-card-observations",
  );
  expect(JSON.parse(String(requests[firstRequestIndex]?.init?.body))).toMatchObject({
    initiatedBy: "system",
    observedAt: "2026-07-17T10:00:00.000Z",
    title: "后端开发",
  });
  expect(String(requests[secondRequestIndex]?.input)).toBe(
    "http://workspace.test:54310/api/job-description-observations",
  );
  expect(JSON.parse(String(requests[secondRequestIndex]?.init?.body))).toMatchObject({
    initiatedBy: "agent",
    reason: "Agent 显式采集当前页面的岗位详情证据",
  });
  expect(cardResult).toEqual(savedObservation);
  expect(descriptionResult).toEqual(savedObservation);
});
