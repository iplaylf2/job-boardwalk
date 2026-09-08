import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, RecommendationPageReference } from "@job-boardwalk/contracts";
import {
  platformCatalog,
  platformIds,
  resolvePlatformWebUrl,
} from "@job-boardwalk/platform-catalog";

// oxlint-disable max-lines, max-lines-per-function -- The editor state stays next to the intent collection it controls.
import { useDashboardRuntime } from "#/dashboard-runtime.js";
import {
  deleteJobSearchIntent,
  saveJobSearchIntent,
  selectJobSearchIntent,
} from "#/workspace-service-client.js";

import styles from "./manager.module.css";

const emptyCollectionLength = 0;
type PlatformId = RecommendationPageReference["platformId"];

function recommendationPageFor(intent: JobSearchIntent | null, platformId: PlatformId) {
  return intent?.recommendationPages.find((page) => page.platformId === platformId);
}

export function JobSearchIntentsSection(props: {
  intents: JobSearchIntent[];
  onChanged: () => void;
}): JSX.Element {
  const runtime = useDashboardRuntime();
  const [editingId, setEditingId] = createSignal<number | "new" | null>(null);
  const [removingId, setRemovingId] = createSignal<number | null>(null);
  const [name, setName] = createSignal("");
  const [position, setPosition] = createSignal("");
  const [city, setCity] = createSignal("");
  const recommendationFields = platformIds.map((platformId) => {
    const [label, setLabel] = createSignal("");
    const [url, setUrl] = createSignal("");
    return { label, platformId, setLabel, setUrl, url };
  });
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  function loadEditor(intent: JobSearchIntent | null): void {
    setName(intent?.name ?? "");
    setPosition(intent?.position ?? "");
    setCity(intent?.city ?? "");
    for (const field of recommendationFields) {
      const page = recommendationPageFor(intent, field.platformId);
      field.setLabel(page?.label ?? "");
      field.setUrl(page?.url ?? "");
    }
    setError("");
    setRemovingId(null);
    setEditingId(intent?.id ?? "new");
  }

  function readRecommendationPages(): RecommendationPageReference[] {
    const candidates = recommendationFields.map((field) => ({
      label: field.label().trim(),
      platformId: field.platformId,
      url: field.url().trim(),
    }));
    for (const page of candidates) {
      if (Boolean(page.label) !== Boolean(page.url)) {
        throw new Error(`${platformCatalog[page.platformId].label}的页面名称和网址需要同时填写。`);
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
      await runtime.run(
        saveJobSearchIntent({
          city: city(),
          ...(typeof editingId() === "number" ? { id: editingId() as number } : {}),
          name: name(),
          position: position(),
          recommendationPages: readRecommendationPages(),
          selected: existing?.selected ?? props.intents.length === emptyCollectionLength,
        }),
      );
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
      await runtime.run(selectJobSearchIntent(intent.id));
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
      await runtime.run(deleteJobSearchIntent(intent.id));
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
    <section class={styles["intentSection"]}>
      <div class={styles["sectionIntroduction"]}>
        <div>
          <h3>求职方向</h3>
          <p>当前方向向助手提供研究起点；系统也会整理其他已打开的招聘平台页面中的岗位。</p>
        </div>
        <button
          class={`${styles["button"]} ${styles["primaryButton"]}`}
          type="button"
          onClick={() => loadEditor(null)}
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
              <article
                class={`${styles["intentCard"]} ${intent.selected ? styles["intentCardSelected"] : ""}`}
              >
                <div class={styles["intentCardHeading"]}>
                  <div>
                    <span class={styles["itemLabel"]}>
                      {intent.selected ? "当前方向" : "其他方向"}
                    </span>
                    <h4>{intent.name}</h4>
                  </div>
                  <div class={styles["intentCardActions"]}>
                    <Show when={!intent.selected}>
                      <button
                        class={styles["editLink"]}
                        type="button"
                        disabled={saving()}
                        onClick={() => select(intent)}
                      >
                        设为当前
                      </button>
                    </Show>
                    <button
                      class={styles["editLink"]}
                      type="button"
                      onClick={() => loadEditor(intent)}
                    >
                      修改
                    </button>
                    <button
                      class={`${styles["editLink"]} ${styles["dangerLink"]}`}
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
                <p class={styles["intentTarget"]}>
                  {intent.position} · {intent.city}
                </p>
                <div class={styles["intentSources"]}>
                  <For each={intent.recommendationPages}>
                    {(page) => (
                      <span>
                        {platformCatalog[page.platformId].label} · {page.label}
                      </span>
                    )}
                  </For>
                </div>
                <Show when={removingId() === intent.id}>
                  <div class={styles["removal"]}>
                    <span>
                      {intent.selected
                        ? "移除当前方向后，助手将不再使用其中的平台页面作为研究起点；已打开页面中的岗位仍会继续整理。"
                        : "移除后，这个方向及其平台研究起点将不再保留。"}
                    </span>
                    <button
                      class={`${styles["button"]} ${styles["dangerButton"]}`}
                      type="button"
                      disabled={saving()}
                      onClick={() => remove(intent)}
                    >
                      {saving() ? "移除中…" : "确认移除"}
                    </button>
                    <button
                      class={styles["button"]}
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
        <form class={`${styles["editor"]} ${styles["intentEditor"]}`} onSubmit={submit}>
          <div class={styles["editorHeading"]}>
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
          <For each={recommendationFields}>
            {(field) => (
              <>
                <label>
                  {platformCatalog[field.platformId].label}页面名称
                  <input
                    value={field.label()}
                    placeholder="例如：北京后端开发"
                    onInput={(event) => field.setLabel(event.currentTarget.value)}
                  />
                </label>
                <label class={styles["wideField"]}>
                  {platformCatalog[field.platformId].label}页面网址
                  <input
                    type="url"
                    value={field.url()}
                    placeholder={resolvePlatformWebUrl(field.platformId, "entry")}
                    onInput={(event) => field.setUrl(event.currentTarget.value)}
                  />
                </label>
              </>
            )}
          </For>
          <Show when={error()}>
            <p class={styles["formError"]} role="alert">
              {error()}
            </p>
          </Show>
          <div class={styles["formActions"]}>
            <button
              class={`${styles["button"]} ${styles["primaryButton"]}`}
              type="submit"
              disabled={saving()}
            >
              {saving() ? "保存中…" : "保存"}
            </button>
            <button class={styles["button"]} type="button" onClick={() => setEditingId(null)}>
              取消
            </button>
          </div>
        </form>
      </Show>
      <Show when={error() && editingId() === null}>
        <p class={`${styles["formError"]} ${styles["sectionError"]}`} role="alert">
          {error()}
        </p>
      </Show>
    </section>
  );
}
