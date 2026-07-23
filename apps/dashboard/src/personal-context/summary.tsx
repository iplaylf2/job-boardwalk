import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { JobSearchIntent, ProfileFact } from "@job-boardwalk/contracts";

import styles from "./summary.module.css";

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
    <section class={styles["direction"]} aria-labelledby="direction-summary-heading">
      <p class={styles["label"]} id="direction-summary-heading">
        当前求职方向
      </p>
      <Show
        when={selectedIntent()}
        fallback={
          <p class={styles["empty"]}>
            尚未选择求职方向。已打开的招聘平台页面仍会整理；当前没有可供助手使用的平台研究起点。
          </p>
        }
      >
        {(intent) => (
          <>
            <h3>{intent().name}</h3>
            <p class={styles["target"]}>
              {intent().position} · {intent().city}
            </p>
            <p class={styles["sourceCount"]}>
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
    <section class={styles["facts"]} aria-labelledby="facts-summary-heading">
      <div class={styles["factsHeading"]}>
        <div>
          <p class={styles["label"]} id="facts-summary-heading">
            解释岗位时会考虑
          </p>
          <p class={styles["count"]}>共 {String(props.facts.length)} 项个人条件</p>
        </div>
        <Show when={hiddenFactCount() > emptyCollectionLength}>
          <button
            aria-controls="profile-fact-summary-list"
            aria-expanded={expanded() ? "true" : "false"}
            class={styles["disclosure"]}
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded() ? "收起" : `查看全部（另有 ${String(hiddenFactCount())} 项）`}
          </button>
        </Show>
      </div>
      <Show
        when={props.facts.length > emptyCollectionLength}
        fallback={<p class={styles["empty"]}>尚未添加个人条件。这不会影响岗位整理。</p>}
      >
        <dl
          class={`${styles["factList"]} ${expanded() ? styles["factListExpanded"] : ""}`}
          id="profile-fact-summary-list"
        >
          <For each={visibleFacts()}>
            {(fact) => (
              <div class={styles["fact"]}>
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
    <div class={styles["summary"]}>
      <DirectionSummary intents={props.intents} />
      <FactsSummary facts={props.facts} />
    </div>
  );
}
