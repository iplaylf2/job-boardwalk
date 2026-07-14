import { expect, test } from "vitest";

import { resolveCdpConnectionOptions } from "#/cdp/connection-options.js";

test("uses the explicit project proxy instead of ambient proxy resolution", () => {
  const connectionOptions = resolveCdpConnectionOptions(
    {
      JOB_BOARDWALK_CDP_PROXY_URL: "http://127.0.0.1:7897",
      JOB_BOARDWALK_CDP_URL: "http://172.19.0.1:9222",
    },
    () => "http://ambient.invalid:8080",
  );

  expect(connectionOptions.endpoint.toString()).toBe("http://172.19.0.1:9222/");
  expect(connectionOptions.proxy?.toString()).toBe("http://127.0.0.1:7897/");
});

test("allows an explicit empty project proxy to require a direct connection", () => {
  const connectionOptions = resolveCdpConnectionOptions(
    {
      JOB_BOARDWALK_CDP_PROXY_URL: "",
      JOB_BOARDWALK_CDP_URL: "http://127.0.0.1:9222",
    },
    () => "http://ambient.invalid:8080",
  );

  expect(connectionOptions.proxy).toBeNull();
});

test("uses standard proxy resolution when no project override exists", () => {
  const connectionOptions = resolveCdpConnectionOptions(
    { JOB_BOARDWALK_CDP_URL: "http://172.19.0.1:9222" },
    () => "http://172.19.0.1:7897",
  );

  expect(connectionOptions.proxy?.port).toBe("7897");
});
