import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export function* waitForTerminalConfirmation(message: string): RiteCoroutine<void> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    yield* until(() => prompt.question(message));
  } finally {
    prompt.close();
  }
}
