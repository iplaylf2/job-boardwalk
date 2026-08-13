import { createServer } from "node:http";

import { expect, test } from "vitest";

import { closeHttpServer } from "#/runtime.js";

test("treats shutdown before the HTTP server starts listening as complete", async () => {
  const httpServer = createServer();

  await expect(closeHttpServer(httpServer)).resolves.toBeUndefined();
});
