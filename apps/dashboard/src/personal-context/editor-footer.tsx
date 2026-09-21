import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { PersonalContextMutation } from "./personal-context-mutation.js";
import styles from "./manager.module.css";

export function EditorFooter(props: {
  mutation: PersonalContextMutation;
  onCancel: () => void;
}): JSX.Element {
  return (
    <>
      <Show when={props.mutation.error()}>
        <p class={styles["formError"]} role="alert">
          {props.mutation.error()}
        </p>
      </Show>
      <div class={styles["formActions"]}>
        <button
          class={`${styles["button"]} ${styles["primaryButton"]}`}
          type="submit"
          disabled={props.mutation.pending()}
        >
          {props.mutation.pending() ? "保存中…" : "保存"}
        </button>
        <button class={styles["button"]} type="button" onClick={props.onCancel}>
          取消
        </button>
      </div>
    </>
  );
}
