import { createSignal, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, ProfileFact } from "@job-boardwalk/contracts";

import { SectionKicker } from "#/ui/section-kicker.js";

import { PersonalContextManager } from "./manager.js";
import { PersonalContextSummary } from "./summary.js";
import styles from "./panel.module.css";

export function PersonalContextPanel(props: {
  facts: ProfileFact[];
  intents: JobSearchIntent[];
  onChanged: () => void;
}): JSX.Element {
  const [managing, setManaging] = createSignal(false);

  return (
    <section class={styles["panel"]} aria-labelledby="profile-heading">
      <header class={styles["heading"]}>
        <div>
          <SectionKicker>当前设置</SectionKicker>
          <h2 id="profile-heading">研究依据</h2>
          <p class={styles["headingCopy"]}>求职方向提供研究起点，个人条件帮助比较和解释岗位。</p>
        </div>
        <div class={styles["headingActions"]}>
          <button
            aria-label="管理研究依据"
            class={styles["button"]}
            type="button"
            onClick={() => setManaging(true)}
          >
            管理依据
          </button>
        </div>
      </header>
      <PersonalContextSummary facts={props.facts} intents={props.intents} />
      <Show when={managing()}>
        <PersonalContextManager
          facts={props.facts}
          intents={props.intents}
          onChanged={props.onChanged}
          onClose={() => setManaging(false)}
        />
      </Show>
    </section>
  );
}
