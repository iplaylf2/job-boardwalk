import type { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { run } from "@shajara/host";
import { expect, test } from "vitest";

import { openPlatform } from "#/platform-access/open-platform.js";

const firstCallIndex = 0;
const oneCall = 1;

function createEncodedResult(snapshot: Record<string, unknown>): CallToolResult {
  const payload = Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64");
  return {
    content: [
      { text: `### Result\n"JOB_BOARDWALK_PLATFORM_PAGE_SNAPSHOT:${payload}"`, type: "text" },
    ],
  };
}

test("opens the platform entry before assessing login state", () =>
  run(function* openLoginPage() {
    const calls: CallToolRequest["params"][] = [];
    const result = yield* openPlatform(
      {
        callTool: function* callTool(params) {
          calls.push(params);
          yield* [];
          if (params.name === "browser_navigate") {
            return { content: [{ text: "navigated", type: "text" }] };
          }
          return createEncodedResult({
            accountIdentityVisible: false,
            loginControlVisible: true,
            text: "手机号登录",
            title: "BOSS直聘",
            url: "https://www.zhipin.com/web/user/",
            verificationControlVisible: false,
          });
        },
      },
      "boss",
    );
    expect(calls[firstCallIndex]).toEqual({
      arguments: { url: "https://www.zhipin.com/" },
      name: "browser_navigate",
    });
    expect(calls.map(({ name }) => name)).toEqual(["browser_navigate", "browser_evaluate"]);
    expect(result).toEqual({
      assessment: { authenticationState: "unauthenticated", evidence: "login-page" },
      outcome: "login-required",
    });
  }));

test("does not assess a platform after navigation fails", () =>
  run(function* rejectNavigationFailure() {
    const calls: CallToolRequest["params"][] = [];
    try {
      yield* openPlatform(
        {
          callTool: function* callTool(params) {
            calls.push(params);
            yield* [];
            return {
              content: [{ text: "navigation unavailable", type: "text" }],
              isError: true,
            };
          },
        },
        "boss",
      );
      throw new Error("导航失败后不应继续评估访问状态");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("navigation unavailable");
      expect(calls).toHaveLength(oneCall);
    }
  }));
