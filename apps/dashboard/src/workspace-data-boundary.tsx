import type { JSX } from "@solidjs/web";
import { Errored, Loading, Show } from "solid-js";

import { WorkspaceReadError } from "./workspace-service-client.js";
import styles from "./workspace-data-boundary.module.css";

interface WorkspaceDataBoundaryProps {
  children: JSX.Element;
  loading: JSX.Element;
}

function readFailure(error: unknown): { message: string; retryable: boolean } {
  return error instanceof WorkspaceReadError
    ? error
    : { message: "读取内容时发生错误。", retryable: true };
}

export function WorkspaceDataBoundary(props: WorkspaceDataBoundaryProps): JSX.Element {
  return (
    <Errored
      fallback={(error, reset) => {
        const failure = readFailure(error());
        return (
          <section class={styles["failure"]} role="alert">
            <h2>内容暂时无法显示</h2>
            <p>{failure.message}</p>
            <Show when={failure.retryable}>
              <button type="button" onClick={reset}>
                重新读取
              </button>
            </Show>
          </section>
        );
      }}
    >
      <Loading fallback={props.loading}>{props.children}</Loading>
    </Errored>
  );
}
