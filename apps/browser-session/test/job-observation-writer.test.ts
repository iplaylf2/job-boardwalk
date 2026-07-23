import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { WorkspaceJobObservationWriter } from "#/workspace-service/job-observation-writer.js";

const firstRequestIndex = 0;
const secondRequestIndex = 1;

test("writes passively collected page facts as a system change", async () => {
  const requests: { input: string | URL | Request; init?: RequestInit }[] = [];
  const writer = new WorkspaceJobObservationWriter(
    new URL("http://workspace.test:54310"),
    (input, init) => {
      requests.push({ input, ...(init ? { init } : {}) });
      return Promise.resolve(new Response(null, { status: 201 }));
    },
  );
  await using scope = createScope();

  await scope.run(() =>
    writer.writeCardObservation({
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
    }),
  );
  await scope.run(() =>
    writer.writeDescriptionObservation({
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
    }),
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
});
