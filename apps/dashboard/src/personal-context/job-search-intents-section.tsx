import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent } from "@job-boardwalk/contracts";
import { deleteJobSearchIntent, selectJobSearchIntent } from "#/workspace-service-client.js";
import { createPersonalContextMutation } from "./personal-context-mutation.js";
import { JobSearchIntentEditor } from "./job-search-intent-editor.js";
import { JobSearchIntentCard } from "./job-search-intent-card.js";
import styles from "./manager.module.css";

const emptyCollectionLength = 0;
function createSectionState(props: { intents: JobSearchIntent[]; onChanged: () => void }) {
  const mutation = createPersonalContextMutation();
  const [editing, setEditing] = createSignal<{ intent: JobSearchIntent | null } | null>(null);
  const [removingId, setRemovingId] = createSignal<number | null>(null);
  function edit(intent: JobSearchIntent | null): void {
    mutation.clearError();
    setRemovingId(null);
    setEditing({ intent });
  }
  function beginRemove(intent: JobSearchIntent): void {
    setEditing(null);
    mutation.clearError();
    setRemovingId(intent.id);
  }
  function completeChange(): void {
    setEditing(null);
    setRemovingId(null);
    props.onChanged();
  }
  async function remove(intent: JobSearchIntent): Promise<void> {
    await mutation.run(
      () => deleteJobSearchIntent(intent.id),
      "无法移除求职方向。",
      completeChange,
    );
  }
  async function select(intent: JobSearchIntent): Promise<void> {
    await mutation.run(
      () => selectJobSearchIntent(intent.id),
      "无法设为当前求职方向。",
      props.onChanged,
    );
  }
  return {
    beginRemove,
    completeChange,
    edit,
    editing,
    mutation,
    remove,
    removingId,
    select,
    setEditing,
    setRemovingId,
  };
}
export function JobSearchIntentsSection(props: {
  intents: JobSearchIntent[];
  onChanged: () => void;
}): JSX.Element {
  const state = createSectionState(props);
  return (
    <section class={styles["intentSection"]}>
      <div class={styles["sectionIntroduction"]}>
        <div>
          <h3>求职方向</h3>
          <p>当前方向为助手提供研究起点，不限制岗位采集范围。</p>
        </div>
        <button
          class={`${styles["button"]} ${styles["primaryButton"]}`}
          type="button"
          onClick={() => state.edit(null)}
        >
          添加方向
        </button>
      </div>
      <Show
        when={props.intents.length !== emptyCollectionLength}
        fallback={
          <p class={styles["empty"]}>
            尚未添加求职方向。添加后，助手可在研究任务中使用关联的平台页面作为起点。
          </p>
        }
      >
        <div class={styles["intentList"]}>
          <For each={props.intents}>
            {(intent) => (
              <JobSearchIntentCard
                intent={intent}
                pending={state.mutation.pending()}
                removing={state.removingId() === intent.id}
                onEdit={() => state.edit(intent)}
                onBeginRemove={() => state.beginRemove(intent)}
                onRemove={() => state.remove(intent)}
                onCancelRemove={() => state.setRemovingId(null)}
                onSelect={() => state.select(intent)}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={state.editing()} keyed>
        {(selection) => (
          <JobSearchIntentEditor
            intent={selection.intent}
            selected={
              props.intents.find((intent) => intent.id === selection.intent?.id)?.selected ??
              props.intents.length === emptyCollectionLength
            }
            mutation={state.mutation}
            onSaved={state.completeChange}
            onCancel={() => state.setEditing(null)}
          />
        )}
      </Show>
      <Show when={state.mutation.error() && !state.editing()}>
        <p class={`${styles["formError"]} ${styles["sectionError"]}`} role="alert">
          {state.mutation.error()}
        </p>
      </Show>
    </section>
  );
}
