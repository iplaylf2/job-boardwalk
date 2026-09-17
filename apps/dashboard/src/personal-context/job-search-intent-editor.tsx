import { createSignal, For } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, RecommendationPageReference } from "@job-boardwalk/contracts";
import {
  platformCatalog,
  platformIds,
  resolvePlatformWebUrl,
} from "@job-boardwalk/platform-catalog";
import { saveJobSearchIntent } from "#/workspace-service-client.js";
import type { PersonalContextMutation } from "./personal-context-mutation.js";
import { EditorFooter } from "./editor-footer.js";
import styles from "./manager.module.css";

const emptyCollectionLength = 0;
interface JobSearchIntentEditorProps {
  intent: JobSearchIntent | null;
  selected: boolean;
  mutation: PersonalContextMutation;
  onSaved: () => void;
  onCancel: () => void;
}
function createIntentEditorState(props: JobSearchIntentEditorProps) {
  const [name, setName] = createSignal(props.intent?.name ?? "");
  const [position, setPosition] = createSignal(props.intent?.position ?? "");
  const [city, setCity] = createSignal(props.intent?.city ?? "");
  const recommendationFields = platformIds.map((platformId) => {
    const page = props.intent?.recommendationPages.find(
      (candidate) => candidate.platformId === platformId,
    );
    const [label, setLabel] = createSignal(page?.label ?? "");
    const [url, setUrl] = createSignal(page?.url ?? "");
    return { label, platformId, setLabel, setUrl, url };
  });
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
    await props.mutation.run(
      () =>
        saveJobSearchIntent({
          city: city(),
          ...(props.intent ? { id: props.intent.id } : {}),
          name: name(),
          position: position(),
          recommendationPages: readRecommendationPages(),
          selected: props.selected,
        }),
      "无法保存求职方向。",
      props.onSaved,
    );
  }
  return { city, name, position, recommendationFields, setCity, setName, setPosition, submit };
}
export function JobSearchIntentEditor(props: JobSearchIntentEditorProps): JSX.Element {
  const state = createIntentEditorState(props);
  return (
    <form class={`${styles["editor"]} ${styles["intentEditor"]}`} onSubmit={state.submit}>
      <div class={styles["editorHeading"]}>
        <strong>{props.intent ? `编辑“${state.name()}”` : "添加求职方向"}</strong>
        <span>至少添加一个招聘平台页面作为研究起点；页面名称和网址需同时填写。</span>
      </div>
      <label>
        方向名称
        <input
          required
          value={state.name()}
          placeholder="例如：北京 Node.js"
          onInput={(event) => state.setName(event.currentTarget.value)}
        />
      </label>
      <label>
        目标岗位
        <input
          required
          value={state.position()}
          placeholder="例如：Node.js"
          onInput={(event) => state.setPosition(event.currentTarget.value)}
        />
      </label>
      <label>
        城市
        <input
          required
          value={state.city()}
          placeholder="例如：北京"
          onInput={(event) => state.setCity(event.currentTarget.value)}
        />
      </label>
      <RecommendationPageFields fields={state.recommendationFields} />
      <EditorFooter mutation={props.mutation} onCancel={props.onCancel} />
    </form>
  );
}
function RecommendationPageFields(props: {
  fields: ReturnType<typeof createIntentEditorState>["recommendationFields"];
}): JSX.Element {
  return (
    <For each={props.fields}>
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
  );
}
