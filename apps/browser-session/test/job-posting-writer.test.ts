import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { WorkspaceJobPostingWriter } from "#/workspace-service/job-posting-writer.js";

const firstRequestIndex = 0;

test("writes passively collected page facts as a system change", async () => {
  const requests: { input: string | URL | Request; init?: RequestInit }[] = [];
  const writer = new WorkspaceJobPostingWriter(
    new URL("http://workspace.test:54310"),
    (input, init) => {
      requests.push({ input, ...(init ? { init } : {}) });
      return Promise.resolve(new Response(null, { status: 201 }));
    },
  );
  await using scope = createScope();

  await scope.run(() =>
    writer.write({
      collectedAt: "2026-07-17T10:00:00.000Z",
      company: "星海科技",
      details: ["Node.js"],
      discoveryUrl: "https://www.zhipin.com/web/geek/jobs",
      jobUrl: "https://www.zhipin.com/job_detail/example.html",
      location: "北京",
      platformId: "boss",
      salaryText: "20-30K",
      summary: "负责后端服务开发。",
      title: "后端开发",
    }),
  );

  expect(String(requests[firstRequestIndex]?.input)).toBe("http://workspace.test:54310/api/jobs");
  expect(JSON.parse(String(requests[firstRequestIndex]?.init?.body))).toMatchObject({
    collectedAt: "2026-07-17T10:00:00.000Z",
    initiatedBy: "system",
    title: "后端开发",
  });
});
