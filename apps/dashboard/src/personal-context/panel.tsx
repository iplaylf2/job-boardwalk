import { createSignal, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, ProfileFact } from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- This panel owns its feature styles.
import "./styles.css";
import { PersonalContextManager } from "./manager.js";
import { PersonalContextSummary } from "./summary.js";

export function PersonalContextPanel(props: {
  facts: ProfileFact[];
  intents: JobSearchIntent[];
  onChanged: () => void;
}): JSX.Element {
  const [managing, setManaging] = createSignal(false);

  return (
    <section class="profile-panel" aria-labelledby="profile-heading">
      <header class="profile-heading">
        <div>
          <p class="section-kicker">当前设置</p>
          <h2 id="profile-heading">研究依据</h2>
          <p class="profile-heading-copy">求职方向决定研究范围，个人条件帮助比较和解释岗位。</p>
        </div>
        <div class="profile-heading-actions">
          <button
            aria-label="管理研究依据"
            class="button mode-button"
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
