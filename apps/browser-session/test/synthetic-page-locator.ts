import type { Locator } from "patchright";

interface SyntheticPageLocatorOptions {
  readonly nth: () => Locator | null;
  readonly readSnapshot: () => Promise<unknown>;
  readonly title: string;
}

export function createSyntheticPageLocator({
  nth,
  readSnapshot,
  title,
}: SyntheticPageLocatorOptions): (selector: string) => Locator {
  return (selector) =>
    ({
      evaluate: () =>
        selector === "html"
          ? Promise.resolve({
              documentReadyState: "complete",
              outcome: "observed",
              title,
            })
          : readSnapshot(),
      nth,
    }) as unknown as Locator;
}
