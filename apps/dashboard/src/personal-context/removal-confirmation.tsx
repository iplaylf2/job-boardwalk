import type { JSX } from "@solidjs/web";
import styles from "./manager.module.css";

export function RemovalConfirmation(props: {
  children: JSX.Element;
  pending: boolean;
  onRemove: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div class={styles["removal"]}>
      <span>{props.children}</span>
      <button
        class={`${styles["button"]} ${styles["dangerButton"]}`}
        type="button"
        disabled={props.pending}
        onClick={props.onRemove}
      >
        {props.pending ? "移除中…" : "确认移除"}
      </button>
      <button class={styles["button"]} type="button" onClick={props.onCancel}>
        取消
      </button>
    </div>
  );
}
