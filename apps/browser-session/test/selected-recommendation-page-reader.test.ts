import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { WorkspaceSelectedRecommendationPageReader } from "#/workspace-service/selected-recommendation-page-reader.js";

test("reads recommendation pages from the selected job-search intent", async () => {
  const reader = new WorkspaceSelectedRecommendationPageReader(
    new URL("http://workspace.test:54310"),
    () =>
      Promise.resolve(
        Response.json({
          browserSessionPresence: { state: "unknown" },
          jobSearchIntents: [
            {
              city: "北京",
              id: 1,
              name: "北京后端开发",
              position: "后端开发",
              recommendationPages: [
                {
                  label: "北京后端开发",
                  platformId: "yupao",
                  url: "https://www.yupao.com/topic/a2c1488/",
                },
              ],
              selected: true,
              updatedAt: "2026-07-17T10:00:00.000Z",
            },
          ],
          platformAccessSummaries: [],
          profileFacts: [],
        }),
      ),
  );
  await using scope = createScope();

  await expect(scope.run(() => reader.read())).resolves.toEqual([
    {
      label: "北京后端开发",
      platformId: "yupao",
      url: "https://www.yupao.com/topic/a2c1488/",
    },
  ]);
});
