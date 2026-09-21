import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ProfileFact } from "@job-boardwalk/contracts";
import { saveProfileFact } from "#/workspace-service-client.js";
import type { PersonalContextMutation } from "./personal-context-mutation.js";
import { EditorFooter } from "./editor-footer.js";
import styles from "./manager.module.css";

export function ProfileFactEditor(props: {
  fact: ProfileFact | null;
  mutation: PersonalContextMutation;
  onSaved: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [key, setKey] = createSignal(props.fact?.key ?? "");
  const [value, setValue] = createSignal(props.fact?.value ?? "");
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await props.mutation.run(
      () =>
        saveProfileFact({
          ...(props.fact ? { id: props.fact.id } : {}),
          key: key(),
          value: value(),
        }),
      "无法保存个人条件。",
      props.onSaved,
    );
  }
  return (
    <form class={styles["editor"]} onSubmit={submit}>
      <div class={styles["editorHeading"]}>
        <strong>{props.fact ? `编辑“${key()}”` : "添加个人条件"}</strong>
        <span>记录你的经验、偏好或限制。</span>
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
      <EditorFooter mutation={props.mutation} onCancel={props.onCancel} />
    </form>
  );
}
