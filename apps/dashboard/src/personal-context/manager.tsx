import { onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, ProfileFact } from "@job-boardwalk/contracts";

import { JobSearchIntentsSection } from "./job-search-intents-section.js";
import { ProfileFactsSection } from "./profile-facts-section.js";

function installModalBehavior(manager: HTMLElement | null, onClose: () => void): () => void {
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  manager?.focus();
  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onClose();
    }
  }
  document.addEventListener("keydown", closeOnEscape);
  return () => {
    document.body.style.overflow = previousOverflow;
    document.removeEventListener("keydown", closeOnEscape);
  };
}

export function PersonalContextManager(props: {
  facts: ProfileFact[];
  intents: JobSearchIntent[];
  onChanged: () => void;
  onClose: () => void;
}): JSX.Element {
  let manager: HTMLElement | null = null;

  onSettled(() => installModalBehavior(manager, props.onClose));

  return (
    <div
      class="context-manager-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section
        ref={(element) => {
          manager = element;
        }}
        aria-labelledby="context-manager-heading"
        aria-modal="true"
        class="context-manager"
        role="dialog"
        tabindex="-1"
      >
        <header class="context-manager-heading">
          <div>
            <p class="section-kicker">当前设置</p>
            <h2 id="context-manager-heading">管理研究依据</h2>
            <p>维护当前求职方向和个人条件；不再适用的内容可以移除。</p>
          </div>
          <button class="button mode-button" type="button" onClick={props.onClose}>
            完成
          </button>
        </header>
        <div class="context-manager-sections">
          <JobSearchIntentsSection intents={props.intents} onChanged={props.onChanged} />
          <ProfileFactsSection facts={props.facts} onChanged={props.onChanged} />
        </div>
      </section>
    </div>
  );
}
