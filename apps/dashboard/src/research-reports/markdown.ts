import MarkdownIt from "markdown-it";
import type { Options } from "markdown-it/lib/index.mjs";
import type Token from "markdown-it/lib/token.mjs";

const markdownRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});
const defaultValidateLink = markdownRenderer.validateLink.bind(markdownRenderer);
const tableAlignmentByInlineStyle: Readonly<Record<string, string>> = {
  "text-align:center": "center",
  "text-align:left": "left",
  "text-align:right": "right",
};

function renderTableCellOpen(tokens: Token[], index: number, options: Options): string {
  const token = tokens[index];
  if (!token) {
    return "";
  }
  const inlineStyle = token.attrGet("style");
  if (inlineStyle) {
    token.attrs = token.attrs?.filter(([name]) => name !== "style") ?? null;
    const alignment = tableAlignmentByInlineStyle[inlineStyle];
    if (alignment) {
      token.attrSet("data-alignment", alignment);
    }
  }
  return markdownRenderer.renderer.renderToken(tokens, index, options);
}

markdownRenderer.disable("image");
markdownRenderer.renderer.rules["td_open"] = renderTableCellOpen;
markdownRenderer.renderer.rules["th_open"] = renderTableCellOpen;
markdownRenderer.validateLink = (url: string): boolean => {
  if (!defaultValidateLink(url)) {
    return false;
  }
  if (url.startsWith("#")) {
    return true;
  }
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

export function renderResearchReportMarkdown(markdown: string): string {
  return markdownRenderer.render(markdown);
}
