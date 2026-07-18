import type { JSX } from "@solidjs/web";

import styles from "./section-kicker.module.css";

export function SectionKicker(props: { children: JSX.Element }): JSX.Element {
  return <p class={styles["kicker"]}>{props.children}</p>;
}
