import { createMemo } from "solid-js";
import type { JSX } from "@solidjs/web";

import { renderResearchReportMarkdown } from "./markdown.js";

export function ResearchReportMarkdownView(props: { markdown: string }): JSX.Element {
  const html = createMemo(() => renderResearchReportMarkdown(props.markdown));
  return <div class="research-report-markdown" innerHTML={html()} />;
}
