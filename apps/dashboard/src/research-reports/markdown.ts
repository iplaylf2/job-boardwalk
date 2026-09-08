import MarkdownIt from "markdown-it";
import type { MarkdownItOptions, Token } from "markdown-it";

const markdownRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});
const defaultValidateLink = markdownRenderer.validateLink.bind(markdownRenderer);
const firstTokenIndex = 0;
const precedingTokenOffset = 1;
const tableAlignmentByInlineStyle: Readonly<Record<string, string>> = {
  "text-align:center": "center",
  "text-align:left": "left",
  "text-align:right": "right",
};

function renderTableCellOpen(
  tokens: Token[],
  index: number,
  options: Required<MarkdownItOptions>,
): string {
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

function isHttpsSourceLink(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function renderLinkOpen(
  tokens: Token[],
  index: number,
  options: Required<MarkdownItOptions>,
): string {
  const token = tokens[index];
  const href = token?.attrGet("href");
  if (token && typeof href === "string" && isHttpsSourceLink(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noreferrer");
    token.attrSet("data-report-source-link", "");
  }
  return markdownRenderer.renderer.renderToken(tokens, index, options);
}

function renderLinkClose(
  tokens: Token[],
  index: number,
  options: Required<MarkdownItOptions>,
): string {
  for (
    let candidateIndex = index - precedingTokenOffset;
    candidateIndex >= firstTokenIndex;
    candidateIndex -= precedingTokenOffset
  ) {
    const candidate = tokens[candidateIndex];
    if (candidate?.type === "link_open") {
      const cue =
        candidate.attrGet("data-report-source-link") === null
          ? ""
          : '<span data-report-source-link-cue role="img" aria-label="在新标签页中打开">↗</span>';
      return `${cue}${markdownRenderer.renderer.renderToken(tokens, index, options)}`;
    }
  }
  return markdownRenderer.renderer.renderToken(tokens, index, options);
}

markdownRenderer.disable("image");
markdownRenderer.renderer.rules["link_close"] = renderLinkClose;
markdownRenderer.renderer.rules["link_open"] = renderLinkOpen;
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
  return isHttpsSourceLink(url);
};

export function renderResearchReportMarkdown(markdown: string): string {
  return markdownRenderer.render(markdown);
}
