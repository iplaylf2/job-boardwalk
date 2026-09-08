// @vitest-environment node

import { expect, test } from "vitest";

import { renderResearchReportMarkdown } from "#/research-reports/markdown.js";

test("renders report tables without inline presentation styles", () => {
  const html = renderResearchReportMarkdown(
    "| 岗位 | 数量 | 判断 |\n| --- | ---: | :---: |\n| Node.js | 3 | 推荐 |",
  );

  expect(html).toContain("<table>");
  expect(html).toContain("<td>Node.js</td>");
  expect(html).toContain('<th data-alignment="right">数量</th>');
  expect(html).toContain('<td data-alignment="center">推荐</td>');
  expect(html).not.toContain(' style="');
});

test("opens HTTPS source links separately and keeps document links local", () => {
  const html = renderResearchReportMarkdown(
    "[查看岗位](https://example.com/job)\n\n[岗位库](/jobs)\n\n[结论](#结论)",
  );

  expect(html).toContain(
    '<a href="https://example.com/job" target="_blank" rel="noreferrer" data-report-source-link="">查看岗位<span data-report-source-link-cue role="img" aria-label="在新标签页中打开">↗</span></a>',
  );
  expect(html).toContain('<a href="/jobs">岗位库</a>');
  expect(html).toContain('<a href="#%E7%BB%93%E8%AE%BA">结论</a>');
  expect(html).not.toContain('<a href="/jobs" target=');
  expect(html).not.toContain('<a href="#%E7%BB%93%E8%AE%BA" target=');
});

test("does not activate raw HTML, unsafe links, or images", () => {
  const html = renderResearchReportMarkdown(
    '<script>alert("raw")</script>\n\n[脚本链接](javascript:alert("link"))\n\n[协议相对外链](//example.com/job)\n\n![远程图片](https://example.com/tracker.png)',
  );

  expect(html).not.toContain("<script>");
  expect(html).not.toContain('<a href="javascript:');
  expect(html).not.toContain('<a href="//example.com');
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;");
});
