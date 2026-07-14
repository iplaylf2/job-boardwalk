import type { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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

test("observes visible account identity without reading browser authentication state", () =>
  run(function* observeAccountIdentity() {
    const calls: CallToolRequest["params"][] = [];
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
    const firstCallIndex = 0;
    const evaluation = calls.at(firstCallIndex)?.arguments?.["function"];
    expect(evaluation).toBeTypeOf("string");
    expect(evaluation).not.toMatch(/cookie|localStorage|sessionStorage/u);
    expect(assessment).toEqual({
      authenticationState: "authenticated",
      evidence: "account-identity",
    });
  }));

test("rejects a page outside the requested recruiting platform", () =>
  run(function* rejectWrongPlatform() {
    try {
      yield* observePlatformAccess(
        {
          callTool: function* callTool() {
            yield* [];
            return createEncodedResult({
              accountIdentityVisible: false,
              loginControlVisible: false,
              text: "Playwright Extension",
              title: "Playwright Extension",
              url: "chrome-extension://mmlmfjhmonkocbjadbfplnigmagldckm/connect.html",
              verificationControlVisible: false,
            });
          },
        },
        "boss",
      );
      throw new Error("其他页面不应被当作 BOSS直聘 访问证据");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("当前标签页不属于 BOSS直聘");
    }
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

test("rejects malformed snapshot fields instead of treating them as visible evidence", () =>
  run(function* rejectMalformedSnapshot() {
    try {
      yield* observePlatformAccess(
        {
          callTool: function* callTool() {
            yield* [];
            return createEncodedResult({
              accountIdentityVisible: "yes",
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
      throw new Error("字段无效的平台快照不应被接受");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("字段无效");
    }
  }));
