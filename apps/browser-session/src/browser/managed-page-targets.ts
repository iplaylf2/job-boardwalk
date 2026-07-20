import type { Page } from "patchright";

const initialRecoveryRevision = 0;

type ManagedPageTargetResolution =
  | { page: Page; state: "navigate" | "ready" | "waiting" }
  | { state: "open" };

interface ManagedPageTarget {
  readonly page: Page;
  readonly recoveryRevision: number;
  readonly state: "navigating" | "ready" | "redirected";
}

export class ManagedPageTargets<Key> {
  readonly #isTargetPage: (key: Key, url: string) => boolean;
  readonly #recoveryRevision: (key: Key) => number;
  readonly #targets = new Map<Key, ManagedPageTarget>();

  public constructor(
    isTargetPage: (key: Key, url: string) => boolean,
    recoveryRevision: (key: Key) => number = () => initialRecoveryRevision,
  ) {
    this.#isTargetPage = isTargetPage;
    this.#recoveryRevision = recoveryRevision;
  }

  public claim(key: Key, page: Page): void {
    this.#set(key, {
      page,
      recoveryRevision: this.#recoveryRevision(key),
      state: "navigating",
    });
  }

  public observe(key: Key, page: Page): void {
    this.#set(key, {
      page,
      recoveryRevision: this.#recoveryRevision(key),
      state: this.#isTargetPage(key, page.url()) ? "ready" : "redirected",
    });
  }

  public resolve(key: Key, pages: Page[]): ManagedPageTargetResolution {
    const target = this.#targets.get(key);
    if (target && pages.includes(target.page)) {
      const currentUrl = target.page.url();
      if (this.#isTargetPage(key, currentUrl)) {
        this.observe(key, target.page);
        return { page: target.page, state: "ready" };
      }
      const mayRecoverRedirect =
        target.state === "redirected" && this.#recoveryRevision(key) > target.recoveryRevision;
      return target.state === "navigating" || mayRecoverRedirect
        ? { page: target.page, state: "navigate" }
        : { page: target.page, state: "waiting" };
    }

    this.#targets.delete(key);
    const existingPage = pages.find((page) => this.#isTargetPage(key, page.url()));
    if (!existingPage) {
      return { state: "open" };
    }
    this.observe(key, existingPage);
    return { page: existingPage, state: "ready" };
  }

  #set(key: Key, target: ManagedPageTarget): void {
    for (const [existingKey, existingTarget] of this.#targets) {
      if (existingTarget.page === target.page) {
        this.#targets.delete(existingKey);
      }
    }
    this.#targets.set(key, target);
  }
}
