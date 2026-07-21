import { createMemo } from "solid-js";
import type { JSX } from "@solidjs/web";

import { renderResearchReportMarkdown } from "./markdown.js";
import styles from "./markdown-view.module.css";

export function ResearchReportMarkdownView(props: { markdown: string }): JSX.Element {
  const html = createMemo(() => renderResearchReportMarkdown(props.markdown));
  return <div class={styles["markdown"]} innerHTML={html()} />;
}
