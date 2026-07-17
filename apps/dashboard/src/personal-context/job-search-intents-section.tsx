import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, RecommendationPageReference } from "@job-boardwalk/contracts";

// oxlint-disable max-lines-per-function -- The editor state stays next to the intent collection it controls.
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
  editing: boolean;
  intents: JobSearchIntent[];
  onChanged: () => void;
}): JSX.Element {
  const visibleIntents = createMemo(() =>
    props.editing ? props.intents : props.intents.filter((intent) => intent.selected),
  );
  const [editingId, setEditingId] = createSignal<number | "new" | null>(null);
  const [name, setName] = createSignal("");
  const [position, setPosition] = createSignal("");
  const [city, setCity] = createSignal("");
  const [bossLabel, setBossLabel] = createSignal("");
  const [bossUrl, setBossUrl] = createSignal("");
  const [yupaoLabel, setYupaoLabel] = createSignal("");
  const [yupaoUrl, setYupaoUrl] = createSignal("");
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

  function loadEditor(intent: JobSearchIntent | null): void {
    setName(intent?.name ?? "");
    setPosition(intent?.position ?? "");
    setCity(intent?.city ?? "");
    setBossLabel(recommendationPageFor(intent, "boss")?.label ?? "");
    setBossUrl(recommendationPageFor(intent, "boss")?.url ?? "");
    setYupaoLabel(recommendationPageFor(intent, "yupao")?.label ?? "");
    setYupaoUrl(recommendationPageFor(intent, "yupao")?.url ?? "");
    setError("");
    setEditingId(intent?.id ?? "new");
  }

  function readRecommendationPages(): RecommendationPageReference[] {
    const candidates = [
      { label: bossLabel().trim(), platformId: "boss" as const, url: bossUrl().trim() },
      { label: yupaoLabel().trim(), platformId: "yupao" as const, url: yupaoUrl().trim() },
    ];
    for (const page of candidates) {
      if (Boolean(page.label) !== Boolean(page.url)) {
        throw new Error(`${platformLabels[page.platformId]}的显示标签和推荐页 URL 需要同时填写。`);
      }
    }
    const recommendationPages = candidates.filter(
      ({ label, url }) =>
        label.length > emptyCollectionLength && url.length > emptyCollectionLength,
    );
    if (recommendationPages.length === emptyCollectionLength) {
      throw new Error("至少关联一个招聘平台的职位推荐页。");
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
      setError(caughtError instanceof Error ? caughtError.message : "无法选中求职方向。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(intent: JobSearchIntent): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await deleteJobSearchIntent(intent.id);
      setEditingId(null);
      props.onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法删除求职方向。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="intent-section">
      <div class="panel-introduction">
        <div>
          <h3>{props.editing ? "管理方向" : "正在关注"}</h3>
          <p>
            {props.editing
              ? "当前方向启用自动整理；推荐页用于开始研究，不会限制从其他已打开的平台页面整理岗位。"
              : "系统会从这个方向的推荐页和其他已打开的平台页面整理岗位。"}
          </p>
        </div>
        <Show when={props.editing}>
          <button class="button button-primary" type="button" onClick={() => loadEditor(null)}>
            添加方向
          </button>
        </Show>
      </div>
      <Show
        when={props.intents.length !== emptyCollectionLength}
        fallback={<p class="empty">还没有求职方向。添加后，系统会从关联推荐页开始自动整理岗位。</p>}
      >
        <div class="intent-list">
          <For each={visibleIntents()}>
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
                    <Show when={props.editing}>
                      <button class="edit-link" type="button" onClick={() => loadEditor(intent)}>
                        修改
                      </button>
                    </Show>
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
              </article>
            )}
          </For>
        </div>
      </Show>
      <Show when={editingId() !== null}>
        <form class="editor intent-editor" onSubmit={submit}>
          <div class="editor-heading">
            <strong>{editingId() === "new" ? "添加求职方向" : `编辑${name()}`}</strong>
            <span>关联各平台中适合作为研究起点的职位推荐页。</span>
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
            BOSS直聘显示标签
            <input
              value={bossLabel()}
              placeholder="例如：Node.js(北京)"
              onInput={(event) => setBossLabel(event.currentTarget.value)}
            />
          </label>
          <label class="editor-wide">
            BOSS直聘推荐页 URL
            <input
              type="url"
              value={bossUrl()}
              placeholder="https://www.zhipin.com/web/geek/jobs"
              onInput={(event) => setBossUrl(event.currentTarget.value)}
            />
          </label>
          <label>
            鱼泡直聘显示标签
            <input
              value={yupaoLabel()}
              placeholder="例如：北京后端开发"
              onInput={(event) => setYupaoLabel(event.currentTarget.value)}
            />
          </label>
          <label class="editor-wide">
            鱼泡直聘推荐页 URL
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
            <Show when={typeof editingId() === "number"}>
              <button
                class="button button-danger"
                type="button"
                disabled={saving()}
                onClick={() => {
                  const intent = props.intents.find((candidate) => candidate.id === editingId());
                  return intent ? remove(intent) : Promise.resolve();
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
