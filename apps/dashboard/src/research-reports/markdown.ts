import MarkdownIt from "markdown-it";

const markdownRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});
const defaultValidateLink = markdownRenderer.validateLink.bind(markdownRenderer);

markdownRenderer.disable("image");
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
