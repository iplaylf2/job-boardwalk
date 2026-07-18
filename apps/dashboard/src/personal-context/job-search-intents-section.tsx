import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, RecommendationPageReference } from "@job-boardwalk/contracts";

// oxlint-disable max-lines, max-lines-per-function -- The editor state stays next to the intent collection it controls.
import {
  deleteJobSearchIntent,
  saveJobSearchIntent,
  selectJobSearchIntent,
} from "#/workspace-service-client.js";

const emptyCollectionLength = 0;
type PlatformId = RecommendationPageReference["platformId"];
const platformLabels: Record<PlatformId, string> = {
  boss: "BOSS直聘",
  yupao: "鱼泡直聘",
};

function recommendationPageFor(intent: JobSearchIntent | null, platformId: PlatformId) {
  return intent?.recommendationPages.find((page) => page.platformId === platformId);
}

export function JobSearchIntentsSection(props: {
  intents: JobSearchIntent[];
  onChanged: () => void;
}): JSX.Element {
  const [editingId, setEditingId] = createSignal<number | "new" | null>(null);
  const [removingId, setRemovingId] = createSignal<number | null>(null);
  const [name, setName] = createSignal("");
  const [position, setPosition] = createSignal("");
  const [city, setCity] = createSignal("");
  const [bossLabel, setBossLabel] = createSignal("");
  const [bossUrl, setBossUrl] = createSignal("");
  const [yupaoLabel, setYupaoLabel] = createSignal("");
  const [yupaoUrl, setYupaoUrl] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  function loadEditor(intent: JobSearchIntent | null): void {
    setName(intent?.name ?? "");
    setPosition(intent?.position ?? "");
    setCity(intent?.city ?? "");
    setBossLabel(recommendationPageFor(intent, "boss")?.label ?? "");
    setBossUrl(recommendationPageFor(intent, "boss")?.url ?? "");
    setYupaoLabel(recommendationPageFor(intent, "yupao")?.label ?? "");
    setYupaoUrl(recommendationPageFor(intent, "yupao")?.url ?? "");
    setError("");
    setRemovingId(null);
    setEditingId(intent?.id ?? "new");
  }

  function readRecommendationPages(): RecommendationPageReference[] {
    const candidates = [
      { label: bossLabel().trim(), platformId: "boss" as const, url: bossUrl().trim() },
      { label: yupaoLabel().trim(), platformId: "yupao" as const, url: yupaoUrl().trim() },
    ];
    for (const page of candidates) {
      if (Boolean(page.label) !== Boolean(page.url)) {
        throw new Error(`${platformLabels[page.platformId]} 的页面名称和网址需要同时填写。`);
      }
    }
    const recommendationPages = candidates.filter(
      ({ label, url }) =>
        label.length > emptyCollectionLength && url.length > emptyCollectionLength,
    );
    if (recommendationPages.length === emptyCollectionLength) {
      throw new Error("至少添加一个招聘平台页面作为研究起点。");
    }
    return recommendationPages;
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const existing = props.intents.find((intent) => intent.id === editingId());
      await saveJobSearchIntent({
        city: city(),
        ...(typeof editingId() === "number" ? { id: editingId() as number } : {}),
        name: name(),
        position: position(),
        recommendationPages: readRecommendationPages(),
        selected: existing?.selected ?? props.intents.length === emptyCollectionLength,
      });
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法保存求职方向。");
    } finally {
      setSaving(false);
    }
  }

  async function select(intent: JobSearchIntent): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await selectJobSearchIntent(intent.id);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法设为当前求职方向。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(intent: JobSearchIntent): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await deleteJobSearchIntent(intent.id);
      setRemovingId(null);
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法移除求职方向。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="intent-section">
      <div class="panel-introduction">
        <div>
          <h3>求职方向</h3>
          <p>
            系统会围绕当前方向自动整理岗位。平台页面是研究起点，其他已打开的相关页面也可纳入整理。
          </p>
        </div>
        <button class="button button-primary" type="button" onClick={() => loadEditor(null)}>
          添加方向
        </button>
      </div>
      <Show
        when={props.intents.length !== emptyCollectionLength}
        fallback={
          <p class="empty">尚未添加求职方向。添加后，系统会从关联的平台页面开始整理岗位。</p>
        }
      >
        <div class="intent-list">
          <For each={props.intents}>
            {(intent) => (
              <article class={`intent-card ${intent.selected ? "intent-card-selected" : ""}`}>
                <div class="intent-card-heading">
                  <div>
                    <span class="item-label">{intent.selected ? "当前方向" : "其他方向"}</span>
                    <h4>{intent.name}</h4>
                  </div>
                  <div class="intent-card-actions">
                    <Show when={!intent.selected}>
                      <button
                        class="edit-link"
                        type="button"
                        disabled={saving()}
                        onClick={() => select(intent)}
                      >
                        设为当前
                      </button>
                    </Show>
                    <button class="edit-link" type="button" onClick={() => loadEditor(intent)}>
                      修改
                    </button>
                    <button
                      class="edit-link danger-link"
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setError("");
                        setRemovingId(intent.id);
                      }}
                    >
                      移除
                    </button>
                  </div>
                </div>
                <p class="intent-target">
                  {intent.position} · {intent.city}
                </p>
                <div class="intent-sources">
                  <For each={intent.recommendationPages}>
                    {(page) => (
                      <span>
                        {platformLabels[page.platformId]} · {page.label}
                      </span>
                    )}
                  </For>
                </div>
                <Show when={removingId() === intent.id}>
                  <div class="remove-confirmation">
                    <span>
                      {intent.selected
                        ? "移除当前方向后，岗位整理会暂停，直到你选择另一个方向。"
                        : "移除后，这个方向及其平台研究起点将不再保留。"}
                    </span>
                    <button
                      class="button button-danger"
                      type="button"
                      disabled={saving()}
                      onClick={() => remove(intent)}
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
      <Show when={editingId() !== null}>
        <form class="editor intent-editor" onSubmit={submit}>
          <div class="editor-heading">
            <strong>{editingId() === "new" ? "添加求职方向" : `编辑“${name()}”`}</strong>
            <span>添加适合作为研究起点的招聘平台页面。</span>
          </div>
          <label>
            方向名称
            <input
              required
              value={name()}
              placeholder="例如：北京 Node.js"
              onInput={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <label>
            目标岗位
            <input
              required
              value={position()}
              placeholder="例如：Node.js"
              onInput={(event) => setPosition(event.currentTarget.value)}
            />
          </label>
          <label>
            城市
            <input
              required
              value={city()}
              placeholder="例如：北京"
              onInput={(event) => setCity(event.currentTarget.value)}
            />
          </label>
          <label>
            BOSS直聘页面名称
            <input
              value={bossLabel()}
              placeholder="例如：Node.js(北京)"
              onInput={(event) => setBossLabel(event.currentTarget.value)}
            />
          </label>
          <label class="editor-wide">
            BOSS直聘页面网址
            <input
              type="url"
              value={bossUrl()}
              placeholder="https://www.zhipin.com/web/geek/jobs"
              onInput={(event) => setBossUrl(event.currentTarget.value)}
            />
          </label>
          <label>
            鱼泡直聘页面名称
            <input
              value={yupaoLabel()}
              placeholder="例如：北京后端开发"
              onInput={(event) => setYupaoLabel(event.currentTarget.value)}
            />
          </label>
          <label class="editor-wide">
            鱼泡直聘页面网址
            <input
              type="url"
              value={yupaoUrl()}
              placeholder="https://www.yupao.com/topic/a2c1488/"
              onInput={(event) => setYupaoUrl(event.currentTarget.value)}
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
    </section>
  );
}
