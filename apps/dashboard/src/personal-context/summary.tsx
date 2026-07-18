import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, ProfileFact } from "@job-boardwalk/contracts";

const emptyCollectionLength = 0;
const maximumVisibleFacts = 4;

interface PersonalContextSummaryProps {
  facts: ProfileFact[];
  intents: JobSearchIntent[];
}

function DirectionSummary(props: { intents: JobSearchIntent[] }): JSX.Element {
  function selectedIntent(): JobSearchIntent | undefined {
    return props.intents.find((intent) => intent.selected);
  }
  return (
    <section class="direction-summary" aria-labelledby="direction-summary-heading">
      <p class="summary-label" id="direction-summary-heading">
        当前求职方向
      </p>
      <Show
        when={selectedIntent()}
        fallback={<p class="summary-empty">尚未选择求职方向，当前不会自动整理岗位。</p>}
      >
        {(intent) => (
          <>
            <h3>{intent().name}</h3>
            <p class="direction-target">
              {intent().position} · {intent().city}
            </p>
            <p class="direction-source-count">
              {String(intent().recommendationPages.length)} 个研究起点
            </p>
          </>
        )}
      </Show>
    </section>
  );
}

function FactsSummary(props: { facts: ProfileFact[] }): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);

  function visibleFacts(): ProfileFact[] {
    return expanded() ? props.facts : props.facts.slice(emptyCollectionLength, maximumVisibleFacts);
  }
  function hiddenFactCount(): number {
    return Math.max(emptyCollectionLength, props.facts.length - maximumVisibleFacts);
  }
  return (
    <section class="facts-summary" aria-labelledby="facts-summary-heading">
      <div class="facts-summary-heading">
        <div>
          <p class="summary-label" id="facts-summary-heading">
            解释岗位时会考虑
          </p>
          <p class="summary-count">共 {String(props.facts.length)} 项个人条件</p>
        </div>
        <Show when={hiddenFactCount() > emptyCollectionLength}>
          <button
            aria-controls="profile-fact-summary-list"
            aria-expanded={expanded() ? "true" : "false"}
            class="summary-disclosure"
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded() ? "收起" : `查看全部（另有 ${String(hiddenFactCount())} 项）`}
          </button>
        </Show>
      </div>
      <Show
        when={props.facts.length > emptyCollectionLength}
        fallback={<p class="summary-empty">尚未添加个人条件。这不会影响岗位整理。</p>}
      >
        <dl
          class={`fact-preview-list ${expanded() ? "fact-preview-list-expanded" : ""}`}
          id="profile-fact-summary-list"
        >
          <For each={visibleFacts()}>
            {(fact) => (
              <div class="fact-preview">
                <dt>{fact.key}</dt>
                <dd>{fact.value}</dd>
              </div>
            )}
          </For>
        </dl>
      </Show>
    </section>
  );
}

export function PersonalContextSummary(props: PersonalContextSummaryProps): JSX.Element {
  return (
    <div class="context-summary">
      <DirectionSummary intents={props.intents} />
      <FactsSummary facts={props.facts} />
    </div>
  );
}
