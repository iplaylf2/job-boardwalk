import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, ProfileFact } from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- This panel owns its feature styles.
import "./styles.css";
import { JobSearchIntentsSection } from "./job-search-intents-section.js";
import { ProfileFactsSection } from "./profile-facts-section.js";

export function PersonalContextPanel(props: {
  facts: ProfileFact[];
  intents: JobSearchIntent[];
  onChanged: () => void;
}): JSX.Element {
  const [editing, setEditing] = createSignal(false);

  return (
    <section class="profile-panel" aria-labelledby="profile-heading">
      <header class="profile-heading">
        <div>
          <p class="section-kicker">研究依据</p>
          <h2 id="profile-heading">方向与个人条件</h2>
          <p class="profile-heading-copy">这些信息决定助手关注什么，以及如何解释岗位。</p>
        </div>
        <div class="profile-heading-actions">
          <button
            class={`button mode-button ${editing() ? "mode-button-active" : ""}`}
            type="button"
            onClick={() => setEditing((value) => !value)}
          >
            {editing() ? "完成" : "调整"}
          </button>
        </div>
      </header>
      <div class="context-sections">
        <JobSearchIntentsSection
          editing={editing()}
          intents={props.intents}
          onChanged={props.onChanged}
        />
        <ProfileFactsSection editing={editing()} facts={props.facts} onChanged={props.onChanged} />
      </div>
    </section>
  );
}
