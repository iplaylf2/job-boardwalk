import type { JSX } from "@solidjs/web";
import type { ProfileFact, TargetLocation } from "@job-boardwalk/contracts";

// oxlint-disable-next-line import/no-unassigned-import -- This panel owns its feature styles.
import "./styles.css";
import { SectionHeading } from "#/section-heading.js";
import { ProfileFactsSection } from "./profile-facts-section.js";
import { TargetLocationsSection } from "./target-locations-section.js";

export function PersonalContextPanel(props: {
  facts: ProfileFact[];
  locations: TargetLocation[];
  onChanged: () => void;
}): JSX.Element {
  return (
    <section class="panel personal-context">
      <SectionHeading number="03" title="个人情况" />
      <div class="context-sections">
        <ProfileFactsSection facts={props.facts} onChanged={props.onChanged} />
        <TargetLocationsSection locations={props.locations} onChanged={props.onChanged} />
      </div>
    </section>
  );
}
