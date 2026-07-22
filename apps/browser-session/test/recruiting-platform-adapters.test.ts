import { expect, test } from "vitest";

import { requireJobCardExtraction } from "#/browser/recruiting-platform-adapters.js";

test.each([
  ["https://www.zhipin.com/web/geek/job-recommend", "boss"],
  ["https://www.zhipin.com/web/geek/jobs?query=Java", "boss"],
  ["https://www.zhipin.com/job_detail/example.html", "boss"],
  ["https://www.yupao.com/topic/a2c1488/", "yupao"],
  ["https://www.yupao.com/zhaogong/a1c0/", "yupao"],
])("provides job-card extraction for an eligible page at %s", (url, platformId) => {
  expect(requireJobCardExtraction(url)).toMatchObject({ platformId });
});

test.each([
  "https://www.zhipin.com/web/geek/recommend?tab=2&sub=1&page=1&tag=4",
  "https://www.yupao.com/user/resume-info/?tab=1&subTab=1&mode=1",
  "https://www.yupao.com/user/resume-info/?tab=4&subTab=1&mode=1",
])("rejects engagement-owned pages from job-card extraction at %s", (url) => {
  expect(() => requireJobCardExtraction(url)).toThrow();
});

test.each([
  "https://example.invalid/jobs",
  "http://www.zhipin.com/web/geek/jobs",
  "https://user:secret@www.yupao.com/topic/a2c1488/",
])("rejects pages outside the supported platform navigation boundary at %s", (url) => {
  expect(() => requireJobCardExtraction(url)).toThrow(/HTTPS 导航范围/u);
});
