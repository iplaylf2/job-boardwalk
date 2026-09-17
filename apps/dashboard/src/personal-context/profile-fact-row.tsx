import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ProfileFact } from "@job-boardwalk/contracts";
import { RemovalConfirmation } from "./removal-confirmation.js";
import styles from "./manager.module.css";

function formatSource(fact: ProfileFact): string {
  if (fact.source === "user") {
    return "由你填写";
  }
  if (fact.confirmed) {
    return "已由你确认";
  }
  return fact.source === "agent" ? "助手补充 · 待你确认" : "待你确认";
}

export function ProfileFactRow(props: {
  fact: ProfileFact;
  pending: boolean;
  removing: boolean;
  onEdit: () => void;
  onBeginRemove: () => void;
  onRemove: () => void;
  onCancelRemove: () => void;
}): JSX.Element {
  return (
    <article class={styles["factRow"]}>
      <div class={styles["factHeading"]}>
        <span class={styles["itemLabel"]}>{props.fact.key}</span>
        <div class={styles["factActions"]}>
          <button
            aria-label={`编辑个人条件：${props.fact.key}`}
            class={styles["editLink"]}
            type="button"
            onClick={props.onEdit}
          >
            修改
          </button>
          <button
            aria-label={`移除个人条件：${props.fact.key}`}
            class={`${styles["editLink"]} ${styles["dangerLink"]}`}
            type="button"
            onClick={props.onBeginRemove}
          >
            移除
          </button>
        </div>
      </div>
      <div class={styles["factBody"]}>
        <p class={styles["factValue"]}>{props.fact.value}</p>
        <span class={styles["factMeta"]}>{formatSource(props.fact)}</span>
      </div>
      <Show when={props.removing}>
        <RemovalConfirmation
          pending={props.pending}
          onRemove={props.onRemove}
          onCancel={props.onCancelRemove}
        >
          移除后，工作区将不再向助手提供这项个人条件。
        </RemovalConfirmation>
      </Show>
    </article>
  );
}
