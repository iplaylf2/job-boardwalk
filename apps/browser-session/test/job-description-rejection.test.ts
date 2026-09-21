import type { Page } from "patchright";
import { run } from "@shajara/host";
import { expect, test, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { captureJobDescriptionObservation } from "#/browser/job-observation/description-observation.js";

const url = "https://www.yupao.com/zhaogong/100000002.html";
const header = "合成数据工程师\n1-2万元/月\n免费聊\n职位详情";

test.each([
  { body: "职位详情\n职位描述：\n合成职责正文。\n职位总结", missing: "岗位标题" },
  {
    body: "职位详情\n职位描述：\n合成职责正文。\n职位总结\n合成推荐工程师\n1-2万元/月\n免费聊",
    missing: "岗位标题",
  },
  { body: header, missing: "职位描述" },
  { body: `${header}\n职位总结`, missing: "职位描述" },
  { body: `${header}\n职位描述：\n无结束边界的合成正文。`, missing: "职位描述" },
])(
  "rejects an unmatched $missing without claiming an unreadable page",
  async ({ body, missing }) => {
    const page = {
      evaluate: (capture: (input: never) => unknown, input: unknown) =>
        Promise.resolve(
          runInNewContext(`(${capture.toString()})(input)`, {
            document: {
              body: { innerText: body },
              querySelector: () => null,
              querySelectorAll: () => [],
            },
            input,
            location: { href: url },
          }),
        ),
      url: () => url,
    } as unknown as Page;
    const failure = await run(function* failure() {
      try {
        yield* captureJobDescriptionObservation(page);
      } catch (error) {
        return error as Error;
      }
      throw new Error("Expected extraction to reject");
    });
    expect(failure.message).toContain(missing);
    expect(failure.message).toContain("页面正文可读");
  },
);

test("reports access evidence even when the challenge has no job description", async () => {
  const observe = vi.fn();
  const text = "Access Verification\nPlease slide to verify";
  const page = {
    evaluate: () =>
      Promise.resolve({ accessElements: [], accessText: text, description: "", title: "", url }),
    url: () => url,
  } as unknown as Page;
  await expect(run(() => captureJobDescriptionObservation(page, observe))).rejects.toThrow();
  expect(observe).toHaveBeenCalledWith({ elements: [], text, url });
});
