import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { TargetLocation } from "@job-boardwalk/contracts";

// oxlint-disable max-lines-per-function -- The editor state stays next to the section it controls.
import { deleteTargetLocation, saveTargetLocation } from "#/workspace-service-client.js";

const emptyCollectionLength = 0;
const nextPriorityIncrement = 1;

export function TargetLocationsSection(props: {
  locations: TargetLocation[];
  onChanged: () => void;
}): JSX.Element {
  const [editingId, setEditingId] = createSignal<number | "new" | null>(null);
  const [city, setCity] = createSignal("");
  const [requirement, setRequirement] = createSignal<"preferred" | "required">("preferred");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  function beginCreate(): void {
    setCity("");
    setRequirement("preferred");
    setError("");
    setEditingId("new");
  }

  function beginEdit(location: TargetLocation): void {
    setCity(location.city);
    setRequirement(location.requirement);
    setError("");
    setEditingId(location.id);
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const existingPriority =
        props.locations.find((location) => location.id === editingId())?.priority ??
        props.locations.length + nextPriorityIncrement;
      await saveTargetLocation({
        city: city(),
        priority: existingPriority,
        requirement: requirement(),
      });
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法保存目标城市。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(location: TargetLocation): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await deleteTargetLocation(location.id);
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法删除目标城市。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="context-subsection">
      <div class="subsection-heading">
        <div>
          <h3>目标城市</h3>
          <p>告诉助手你愿意去哪些城市，以及哪些属于硬性范围。</p>
        </div>
        <button class="button button-primary" type="button" onClick={beginCreate}>
          添加城市
        </button>
      </div>
      <Show
        when={props.locations.length !== emptyCollectionLength}
        fallback={
          <Show when={editingId() !== "new"}>
            <p class="empty">还没有填写目标城市。</p>
          </Show>
        }
      >
        <div class="locations">
          <For each={props.locations}>
            {(location) => (
              <button
                class="location-card"
                type="button"
                aria-label={`编辑目标城市：${location.city}`}
                onClick={() => beginEdit(location)}
              >
                <strong>{location.city}</strong>
                <span>{location.requirement === "required" ? "硬性范围" : "优先考虑"}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={editingId() !== null}>
        <form class="editor" onSubmit={submit}>
          <label>
            城市
            <input
              required
              value={city()}
              placeholder="例如：上海"
              disabled={editingId() !== "new"}
              onInput={(event) => setCity(event.currentTarget.value)}
            />
          </label>
          <fieldset>
            <legend>城市偏好</legend>
            <label class="radio-option">
              <input
                type="radio"
                name="requirement"
                value="preferred"
                checked={requirement() === "preferred"}
                onChange={() => setRequirement("preferred")}
              />
              优先考虑
            </label>
            <label class="radio-option">
              <input
                type="radio"
                name="requirement"
                value="required"
                checked={requirement() === "required"}
                onChange={() => setRequirement("required")}
              />
              硬性范围
            </label>
          </fieldset>
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
                  const location = props.locations.find(
                    (candidate) => candidate.id === editingId(),
                  );
                  return location ? remove(location) : Promise.resolve();
                }}
              >
                删除
              </button>
            </Show>
          </div>
        </form>
      </Show>
    </section>
  );
}
