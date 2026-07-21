import { completer } from "@shajara/host";
import type { RiteCoroutine, RiteRoutine } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

const noActiveCollections = 0;
const oneActiveCollection = 1;
type CollectionControlState = "active" | "preparing-handoff" | "quiescing" | "user-handoff";
type CollectionRunResult<Return> =
  | { readonly started: false }
  | { readonly started: true; readonly value: Return };

export class BackgroundCollectionControl {
  #activeCollectionCount = noActiveCollections;
  #resolveQuiescence: (() => unknown) | null = null;
  #state: CollectionControlState = "active";

  public *pauseForUserHandoff(): RiteCoroutine<void> {
    if (this.#state !== "active") {
      throw new Error("浏览器交接已经开始，不能重复准备登录界面。");
    }
    this.#state = "quiescing";
    const quiescence = yield* completer<true>();
    if (this.#activeCollectionCount === noActiveCollections) {
      quiescence.resolve(true);
    } else {
      this.#resolveQuiescence = () => quiescence.resolve(true);
    }
    try {
      yield* wait(quiescence.future);
      this.#state = "preparing-handoff";
    } catch (error) {
      this.cancelUserHandoff();
      throw error;
    } finally {
      this.#resolveQuiescence = null;
    }
  }

  public completeUserHandoff(): void {
    if (this.#state !== "preparing-handoff") {
      throw new Error("登录界面尚未准备完成，不能交出浏览器控制权。");
    }
    this.#state = "user-handoff";
  }

  public cancelUserHandoff(): void {
    if (this.#state === "quiescing" || this.#state === "preparing-handoff") {
      this.#state = "active";
    }
  }

  public returnControl(): boolean {
    if (this.#state !== "user-handoff") {
      return false;
    }
    this.#state = "active";
    return true;
  }

  public *runCollection<Return>(
    collection: RiteRoutine<Return>,
  ): RiteCoroutine<CollectionRunResult<Return>> {
    if (this.#state !== "active") {
      return { started: false };
    }
    this.#activeCollectionCount += oneActiveCollection;
    try {
      return { started: true, value: yield* collection() };
    } finally {
      this.#activeCollectionCount -= oneActiveCollection;
      if (this.#activeCollectionCount === noActiveCollections) {
        this.#resolveQuiescence?.();
      }
    }
  }
}
