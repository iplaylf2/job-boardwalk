import { onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobPosting } from "@job-boardwalk/contracts";

import styles from "./description-dialog.module.css";

function contextId(jobId: number): string {
  return `job-description-context-${String(jobId)}`;
}

function headingId(jobId: number): string {
  return `job-description-title-${String(jobId)}`;
}

function JobDescriptionHeader(props: { job: JobPosting; onClose: () => void }): JSX.Element {
  return (
    <header>
      <div>
        <p id={contextId(props.job.id)} class={styles["context"]}>
          职位描述
        </p>
        <h2 id={headingId(props.job.id)}>{props.job.title}</h2>
        <Show when={props.job.company}>
          {(company) => <p class={styles["company"]}>{company()}</p>}
        </Show>
      </div>
      <button autofocus type="button" onClick={props.onClose}>
        关闭
      </button>
    </header>
  );
}

export function JobDescriptionDialog(props: { job: JobPosting; onClose: () => void }): JSX.Element {
  let dialog: HTMLDialogElement | null = null;

  onSettled(() => {
    dialog?.showModal();
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  });

  return (
    <dialog
      ref={(element) => {
        dialog = element;
      }}
      aria-labelledby={`${contextId(props.job.id)} ${headingId(props.job.id)}`}
      class={styles["dialog"]}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <article class={styles["panel"]}>
        <JobDescriptionHeader job={props.job} onClose={props.onClose} />
        <div class={styles["body"]}>
          <Show when={props.job.description?.truncated}>
            <p class={styles["notice"]}>采集文本已达到本地长度上限，以下内容可能不完整。</p>
          </Show>
          <p class={styles["description"]}>{props.job.description?.text}</p>
        </div>
      </article>
    </dialog>
  );
}
