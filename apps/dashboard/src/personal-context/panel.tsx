import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ProfileFact, TargetLocation } from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- This panel owns its feature styles.
import "./styles.css";
import { ProfileFactsSection } from "./profile-facts-section.js";
import { TargetLocationsSection } from "./target-locations-section.js";

export function PersonalContextPanel(props: {
  facts: ProfileFact[];
  locations: TargetLocation[];
  onChanged: () => void;
}): JSX.Element {
  const [editing, setEditing] = createSignal(false);

  return (
    <section class="profile-panel" aria-labelledby="profile-heading">
      <header class="profile-heading">
        <div>
          <p class="section-kicker">求职画像</p>
          <h2 id="profile-heading">个人情况</h2>
        </div>
        <div class="profile-heading-actions">
          <p>
            {editing()
              ? "编辑操作已显示，完成后返回简洁的阅读视图。"
              : "这些信息会作为助手筛选和解释岗位的依据。"}
          </p>
          <button
            class={`button mode-button ${editing() ? "mode-button-active" : ""}`}
            type="button"
            onClick={() => setEditing((value) => !value)}
          >
            {editing() ? "完成编辑" : "编辑资料"}
          </button>
        </div>
      </header>
      <div class="context-sections">
        <ProfileFactsSection editing={editing()} facts={props.facts} onChanged={props.onChanged} />
        <TargetLocationsSection
          editing={editing()}
          locations={props.locations}
          onChanged={props.onChanged}
        />
      </div>
    </section>
  );
}
