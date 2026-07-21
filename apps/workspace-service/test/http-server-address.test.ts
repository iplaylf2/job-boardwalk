import { expect, test } from "vitest";

import { resolveHttpServerAddress } from "#/runtime/http-server-address.js";

test("binds to loopback on the stable Workspace Service port by default", () => {
  expect(resolveHttpServerAddress({})).toEqual({
    hostname: "127.0.0.1",
    port: 54_310,
  });
});

test.each([
  { hostname: "0.0.0.0", name: "container wildcard address" },
  { hostname: "workspace-service", name: "resolvable hostname" },
])("accepts an explicit $name", ({ hostname }) => {
  expect(
    resolveHttpServerAddress({
      JOB_BOARDWALK_WORKSPACE_SERVICE_HOST: hostname,
      JOB_BOARDWALK_WORKSPACE_SERVICE_PORT: "54310",
    }),
  ).toEqual({
    hostname,
    port: 54_310,
  });
});

test.each([
  {
    environment: { JOB_BOARDWALK_WORKSPACE_SERVICE_PORT: "0" },
    message: "JOB_BOARDWALK_WORKSPACE_SERVICE_PORT 必须是有效端口号",
    name: "rejects a port outside the TCP range",
  },
  {
    environment: { JOB_BOARDWALK_WORKSPACE_SERVICE_PORT: "54310.5" },
    message: "JOB_BOARDWALK_WORKSPACE_SERVICE_PORT 必须是有效端口号",
    name: "rejects a fractional port",
  },
])("$name", ({ environment, message }) => {
  expect(() => resolveHttpServerAddress(environment)).toThrow(message);
});
