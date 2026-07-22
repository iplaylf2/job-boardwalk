import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { WorkspaceJobEngagementWriter } from "#/workspace-service/job-engagement-writer.js";

const firstRequestIndex = 0;

test("attributes explicitly requested job-engagement synchronization to the agent", async () => {
  const requests: RequestInit[] = [];
  const writer = new WorkspaceJobEngagementWriter(
    new URL("http://127.0.0.1:54310"),
    (_input, init) => {
      requests.push(init ?? {});
      return Promise.resolve(
        Response.json({
          complete: true,
          engagement: "interested",
          observed: 1,
          platformId: "boss",
          removed: 0,
          synchronizedAt: "2026-07-22T10:00:00.000Z",
        }),
      );
    },
  );
  await using scope = createScope();

  await scope.run(() =>
    writer.write({
      capturedAt: "2026-07-22T10:00:00.000Z",
      complete: true,
      engagement: "interested",
      jobs: [
        {
          details: [],
          externalJobId: "synthetic-interest",
          summary: "示例岗位",
          title: "示例岗位",
        },
      ],
      platformId: "boss",
      sourceUrl: "https://www.zhipin.com/web/geek/recommend?tab=4&sub=1&page=1&tag=4",
      total: 1,
    }),
  );

  expect(JSON.parse(String(requests[firstRequestIndex]?.body))).toMatchObject({
    initiatedBy: "agent",
  });
});
