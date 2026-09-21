import { expect, test } from "vitest";
import { resolveWorkspaceServiceUrl } from "#/workspace-service/configuration.js";

test("resolves an independently configured Workspace Service endpoint", () => {
  expect(
    resolveWorkspaceServiceUrl({
      JOB_BOARDWALK_WORKSPACE_SERVICE_URL: "https://workspace.example.test:8443",
    }).toString(),
  ).toBe("https://workspace.example.test:8443/");
  expect(() =>
    resolveWorkspaceServiceUrl({
      JOB_BOARDWALK_WORKSPACE_SERVICE_URL: "file:///tmp/workspace",
    }),
  ).toThrow(/HTTP/u);
});
