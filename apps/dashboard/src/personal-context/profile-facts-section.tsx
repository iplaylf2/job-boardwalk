import { createSignal, For, Show } from "solid-js";
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
  facts: ProfileFact[];
  onChanged: () => void;
}): JSX.Element {
  const [editingId, setEditingId] = createSignal<number | "new" | null>(null);
  const [removingId, setRemovingId] = createSignal<number | null>(null);
  const [key, setKey] = createSignal("");
  const [value, setValue] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  function beginCreate(): void {
    setKey("");
    setValue("");
    setError("");
    setRemovingId(null);
    setEditingId("new");
  }

  function beginEdit(fact: ProfileFact): void {
    setKey(fact.key);
    setValue(fact.value);
    setError("");
    setRemovingId(null);
    setEditingId(fact.id);
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveProfileFact({
        ...(typeof editingId() === "number" ? { id: editingId() as number } : {}),
        key: key(),
        value: value(),
      });
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法保存个人条件。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(fact: ProfileFact): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await deleteProfileFact(fact.id);
      setRemovingId(null);
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法移除这项个人条件。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="context-primary">
      <div class="panel-introduction">
        <div>
          <h3>个人条件</h3>
          <p>
            {props.facts.length === emptyCollectionLength
              ? "尚未添加。这不会影响岗位整理。"
              : `共 ${String(props.facts.length)} 项个人条件`}
          </p>
        </div>
        <button class="button button-primary" type="button" onClick={beginCreate}>
          添加条件
        </button>
      </div>
      <Show when={editingId() !== null}>
        <form class="editor" onSubmit={submit}>
          <div class="editor-heading">
            <strong>{editingId() === "new" ? "添加个人条件" : `编辑“${key()}”`}</strong>
            <span>说明助手比较和解释岗位时应考虑的经验、偏好或限制。</span>
          </div>
          <label>
            条件名称
            <input
              required
              value={key()}
              placeholder="例如：工作经验"
              onInput={(event) => setKey(event.currentTarget.value)}
            />
          </label>
          <label>
            内容
            <textarea
              required
              rows="3"
              value={value()}
              placeholder="例如：9 年以上软件开发经验"
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
          </div>
        </form>
      </Show>
      <Show when={error() && editingId() === null}>
        <p class="form-error collection-error" role="alert">
          {error()}
        </p>
      </Show>
      <Show
        when={props.facts.length !== emptyCollectionLength}
        fallback={
          <Show when={editingId() !== "new"}>
            <p class="empty">可添加希望助手在比较岗位时考虑的经验、偏好或限制。</p>
          </Show>
        }
      >
        <div class="editable-list">
          <For each={props.facts}>
            {(fact) => (
              <article class="editable-row">
                <div class="editable-row-heading">
                  <span class="item-label">{fact.key}</span>
                  <div class="editable-row-actions">
                    <button
                      aria-label={`编辑个人条件：${fact.key}`}
                      class="edit-link"
                      type="button"
                      onClick={() => beginEdit(fact)}
                    >
                      修改
                    </button>
                    <button
                      aria-label={`移除个人条件：${fact.key}`}
                      class="edit-link danger-link"
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setError("");
                        setRemovingId(fact.id);
                      }}
                    >
                      移除
                    </button>
                  </div>
                </div>
                <div class="editable-row-body">
                  <p class="item-value">{fact.value}</p>
                  <span class="item-meta">{formatSource(fact)}</span>
                </div>
                <Show when={removingId() === fact.id}>
                  <div class="remove-confirmation">
                    <span>移除后，助手将不再在比较和解释岗位时考虑这项条件。</span>
                    <button
                      class="button button-danger"
                      type="button"
                      disabled={saving()}
                      onClick={() => remove(fact)}
                    >
                      {saving() ? "移除中…" : "确认移除"}
                    </button>
                    <button
                      class="button button-quiet"
                      type="button"
                      onClick={() => setRemovingId(null)}
                    >
                      取消
                    </button>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
