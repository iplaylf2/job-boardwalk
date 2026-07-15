import type { JSX } from "@solidjs/web";

export function SectionHeading(props: { number: string; title: string }): JSX.Element {
  return (
    <div class="section-heading">
      <span>{props.number}</span>
      <h2>{props.title}</h2>
    </div>
  );
}
