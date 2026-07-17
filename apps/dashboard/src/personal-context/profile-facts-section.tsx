import { createEffect, createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ProfileFact } from "@job-boardwalk/contracts";

// oxlint-disable max-lines-per-function -- The editor state stays next to the section it controls.
import { deleteProfileFact, saveProfileFact } from "#/workspace-service-client.js";

const emptyCollectionLength = 0;

function formatSource(fact: ProfileFact): string {
  if (fact.source === "user") {
    return "由你填写";
  }
  if (fact.confirmed) {
    return "已由你确认";
  }
  return fact.source === "agent" ? "助手补充 · 待你确认" : "待你确认";
}

export function ProfileFactsSection(props: {
  editing: boolean;
  facts: ProfileFact[];
  onChanged: () => void;
}): JSX.Element {
  const [editingId, setEditingId] = createSignal<number | "new" | null>(null);
  const [key, setKey] = createSignal("");
  const [value, setValue] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(
    () => props.editing,
    (editing) => {
      if (!editing) {
        setEditingId(null);
      }
    },
  );

  function beginCreate(): void {
    setKey("");
    setValue("");
    setError("");
    setEditingId("new");
  }

  function beginEdit(fact: ProfileFact): void {
    setKey(fact.key);
    setValue(fact.value);
    setError("");
    setEditingId(fact.id);
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveProfileFact({ key: key(), value: value() });
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法保存更改。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(fact: ProfileFact): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await deleteProfileFact(fact.id);
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法删除这项内容。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="context-primary">
      <div class="panel-introduction">
        <div>
          <h3>资料摘要</h3>
          <p>{String(props.facts.length)} 项已确认信息</p>
        </div>
        <Show when={props.editing}>
          <button class="button button-primary" type="button" onClick={beginCreate}>
            添加资料
          </button>
        </Show>
      </div>
      <Show when={editingId() !== null}>
        <form class="editor" onSubmit={submit}>
          <div class="editor-heading">
            <strong>{editingId() === "new" ? "添加资料" : `编辑${key()}`}</strong>
            <span>只保留会影响岗位判断的信息。</span>
          </div>
          <label>
            信息类别
            <input
              required
              value={key()}
              placeholder="例如：目标岗位、工作经验、工作偏好"
              disabled={editingId() !== "new"}
              onInput={(event) => setKey(event.currentTarget.value)}
            />
          </label>
          <label>
            内容
            <textarea
              required
              rows="3"
              value={value()}
              placeholder="写下希望助手了解的信息"
              onInput={(event) => setValue(event.currentTarget.value)}
            />
          </label>
          <Show when={error()}>
            <p class="form-error" role="alert">
              {error()}
            </p>
          </Show>
          <div class="form-actions">
            <button class="button button-primary" type="submit" disabled={saving()}>
              {saving() ? "保存中…" : "保存"}
            </button>
            <button class="button button-quiet" type="button" onClick={() => setEditingId(null)}>
              取消
            </button>
            <Show when={typeof editingId() === "number"}>
              <button
                class="button button-danger"
                type="button"
                disabled={saving()}
                onClick={() => {
                  const fact = props.facts.find((candidate) => candidate.id === editingId());
                  return fact ? remove(fact) : Promise.resolve();
                }}
              >
                删除
              </button>
            </Show>
          </div>
        </form>
      </Show>
      <Show
        when={props.facts.length !== emptyCollectionLength}
        fallback={
          <Show when={editingId() !== "new"}>
            <p class="empty">还没有填写个人情况，可以先从目标岗位或工作经历写起。</p>
          </Show>
        }
      >
        <div class="editable-list">
          <For each={props.facts}>
            {(fact) => (
              <article class="editable-row">
                <div class="editable-row-heading">
                  <span class="item-label">{fact.key}</span>
                  <Show when={props.editing}>
                    <button
                      aria-label={`编辑个人情况：${fact.key}`}
                      class="edit-link"
                      type="button"
                      onClick={() => beginEdit(fact)}
                    >
                      修改
                    </button>
                  </Show>
                </div>
                <div class="editable-row-body">
                  <p class="item-value">{fact.value}</p>
                  <span class="item-meta">{formatSource(fact)}</span>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
