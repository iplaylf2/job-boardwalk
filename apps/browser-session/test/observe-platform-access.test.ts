import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { run } from "@shajara/host";
import { expect, test } from "vitest";

import { observePlatformAccess } from "#/platform-access/observe-platform-access.js";

const oneCall = 1;

function createEncodedResult(snapshot: Record<string, unknown>): CallToolResult {
  const payload = Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64");
  return {
    content: [
      { text: `### Result\n"JOB_BOARDWALK_PLATFORM_PAGE_SNAPSHOT:${payload}"`, type: "text" },
    ],
  };
}

test("observes visible account identity without reading authentication cookies", () =>
  run(function* observeAccountIdentity() {
    const calls: unknown[] = [];
    const assessment = yield* observePlatformAccess(
      {
        callTool: function* callTool(params) {
          calls.push(params);
          yield* [];
          return createEncodedResult({
            accountIdentityVisible: true,
            loginControlVisible: false,
            text: "我的求职中心",
            title: "BOSS直聘",
            url: "https://www.zhipin.com/web/geek/jobs",
            verificationControlVisible: false,
          });
        },
      },
      "boss",
    );
    expect(calls).toHaveLength(oneCall);
    expect(assessment).toEqual({
      authenticationState: "authenticated",
      evidence: "account-identity",
    });
  }));

test("does not infer an interruption from an ordinary route", () =>
  run(function* observeOrdinaryRoute() {
    const assessment = yield* observePlatformAccess(
      {
        callTool: function* callTool() {
          yield* [];
          return createEncodedResult({
            accountIdentityVisible: false,
            loginControlVisible: false,
            text: "高级前端工程师职位详情",
            title: "高级前端工程师招聘",
            url: "https://www.zhipin.com/job_detail/123.html",
            verificationControlVisible: false,
          });
        },
      },
      "boss",
    );
    expect(assessment).toBeNull();
  }));
