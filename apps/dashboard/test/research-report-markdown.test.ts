// @vitest-environment node

import { expect, test } from "vitest";

import { renderResearchReportMarkdown } from "#/research-reports/markdown.js";

test("renders report tables, HTTPS links, and Dashboard-local links", () => {
  const html = renderResearchReportMarkdown(
    "| 岗位 | 数量 | 判断 |\n| --- | ---: | :---: |\n| Node.js | 3 | 推荐 |\n\n[查看岗位](https://example.com/job)\n\n[岗位库](/jobs)\n\n[结论](#结论)",
  );

  expect(html).toContain("<table>");
  expect(html).toContain("<td>Node.js</td>");
  expect(html).toContain('<th data-alignment="right">数量</th>');
  expect(html).toContain('<td data-alignment="center">推荐</td>');
  expect(html).not.toContain(' style="');
  expect(html).toContain('<a href="https://example.com/job">查看岗位</a>');
  expect(html).toContain('<a href="/jobs">岗位库</a>');
  expect(html).toContain('<a href="#%E7%BB%93%E8%AE%BA">结论</a>');
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
