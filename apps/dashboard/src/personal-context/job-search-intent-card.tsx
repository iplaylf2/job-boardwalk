import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent } from "@job-boardwalk/contracts";
import { platformCatalog } from "@job-boardwalk/platform-catalog";
import { RemovalConfirmation } from "./removal-confirmation.js";
import styles from "./manager.module.css";

export function JobSearchIntentCard(props: {
  intent: JobSearchIntent;
  pending: boolean;
  removing: boolean;
  onEdit: () => void;
  onBeginRemove: () => void;
  onRemove: () => void;
  onCancelRemove: () => void;
  onSelect: () => void;
}): JSX.Element {
  return (
    <article
      class={`${styles["intentCard"]} ${props.intent.selected ? styles["intentCardSelected"] : ""}`}
    >
      <div class={styles["intentCardHeading"]}>
        <div>
          <span class={styles["itemLabel"]}>{props.intent.selected ? "当前方向" : "其他方向"}</span>
          <h4>{props.intent.name}</h4>
        </div>
        <div class={styles["intentCardActions"]}>
          <Show when={!props.intent.selected}>
            <button
              class={styles["editLink"]}
              type="button"
              disabled={props.pending}
              onClick={props.onSelect}
            >
              设为当前
            </button>
          </Show>
          <button class={styles["editLink"]} type="button" onClick={props.onEdit}>
            修改
          </button>
          <button
            class={`${styles["editLink"]} ${styles["dangerLink"]}`}
            type="button"
            onClick={props.onBeginRemove}
          >
            移除
          </button>
        </div>
      </div>
      <p class={styles["intentTarget"]}>
        {props.intent.position} · {props.intent.city}
      </p>
      <div class={styles["intentSources"]}>
        <For each={props.intent.recommendationPages}>
          {(page) => (
            <span>
              {platformCatalog[page.platformId].label} · {page.label}
            </span>
          )}
        </For>
      </div>
      <Show when={props.removing}>
        <RemovalConfirmation
          pending={props.pending}
          onRemove={props.onRemove}
          onCancel={props.onCancelRemove}
        >
          {props.intent.selected
            ? "移除后将没有当前求职方向。已采集的岗位会保留，岗位采集范围不变。"
            : "移除后，这个方向及其平台页面关联将被删除，已采集的岗位会保留。"}
        </RemovalConfirmation>
      </Show>
    </article>
  );
}
