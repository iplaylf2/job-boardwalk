import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { WorkspaceSelectedJobSearchIntentReader } from "#/workspace-service/selected-job-search-intent-reader.js";

test("reads the selected job-search intent used by passive collection", async () => {
  const reader = new WorkspaceSelectedJobSearchIntentReader(
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

  await expect(scope.run(() => reader.read())).resolves.toMatchObject({
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
  });
});

test("rejects a workspace response that does not satisfy the shared contract", async () => {
  const reader = new WorkspaceSelectedJobSearchIntentReader(
    new URL("http://workspace.test:54310"),
    () =>
      Promise.resolve(
        Response.json({
          browserSessionPresence: { state: "unknown" },
          jobSearchIntents: [],
          profileFacts: [],
        }),
      ),
  );
  const scope = createScope();

  await expect(scope.run(() => reader.read())).rejects.toThrow();
  await expect(scope[Symbol.asyncDispose]()).rejects.toThrow();
});
