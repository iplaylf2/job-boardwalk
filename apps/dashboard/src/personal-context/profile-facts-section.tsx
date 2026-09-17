import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ProfileFact } from "@job-boardwalk/contracts";
import { deleteProfileFact } from "#/workspace-service-client.js";
import { createPersonalContextMutation } from "./personal-context-mutation.js";
import { ProfileFactEditor } from "./profile-fact-editor.js";
import { ProfileFactRow } from "./profile-fact-row.js";
import styles from "./manager.module.css";

const emptyCollectionLength = 0;
function createSectionState(props: { facts: ProfileFact[]; onChanged: () => void }) {
  const mutation = createPersonalContextMutation();
  const [editing, setEditing] = createSignal<{ fact: ProfileFact | null } | null>(null);
  const [removingId, setRemovingId] = createSignal<number | null>(null);
  function edit(fact: ProfileFact | null): void {
    mutation.clearError();
    setRemovingId(null);
    setEditing({ fact });
  }
  function beginRemove(fact: ProfileFact): void {
    setEditing(null);
    mutation.clearError();
    setRemovingId(fact.id);
  }
  function completeChange(): void {
    setEditing(null);
    setRemovingId(null);
    props.onChanged();
  }
  async function remove(fact: ProfileFact): Promise<void> {
    await mutation.run(() => deleteProfileFact(fact.id), "无法移除这项个人条件。", completeChange);
  }
  return {
    beginRemove,
    completeChange,
    edit,
    editing,
    mutation,
    remove,
    removingId,
    setEditing,
    setRemovingId,
  };
}
export function ProfileFactsSection(props: {
  facts: ProfileFact[];
  onChanged: () => void;
}): JSX.Element {
  const state = createSectionState(props);
  return (
    <div class={styles["factsSection"]}>
      <div class={styles["sectionIntroduction"]}>
        <div>
          <h3>个人条件</h3>
          <p>
            {props.facts.length === emptyCollectionLength
              ? "尚未添加。这不会影响岗位整理。"
              : `共 ${String(props.facts.length)} 项个人条件`}
          </p>
        </div>
        <button
          class={`${styles["button"]} ${styles["primaryButton"]}`}
          type="button"
          onClick={() => state.edit(null)}
        >
          添加条件
        </button>
      </div>
      <Show when={state.editing()} keyed>
        {(selection) => (
          <ProfileFactEditor
            fact={selection.fact}
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
      <Show
        when={props.facts.length !== emptyCollectionLength}
        fallback={
          <Show when={!state.editing()}>
            <p class={styles["empty"]}>可添加希望助手在比较和解释岗位时考虑的经验、偏好或限制。</p>
          </Show>
        }
      >
        <div class={styles["factList"]}>
          <For each={props.facts}>
            {(fact) => (
              <ProfileFactRow
                fact={fact}
                pending={state.mutation.pending()}
                removing={state.removingId() === fact.id}
                onEdit={() => state.edit(fact)}
                onBeginRemove={() => state.beginRemove(fact)}
                onRemove={() => state.remove(fact)}
                onCancelRemove={() => state.setRemovingId(null)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
