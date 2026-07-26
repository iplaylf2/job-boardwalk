import { expect, test } from "vitest";

import { installStdinShutdown } from "#/stdin-shutdown.js";

test("adapts Desktop Manager stdin closure to standard process termination", () => {
  const observed: {
    stdinEndListener?: () => void;
    stdinResumed: boolean;
    terminationRequested: boolean;
  } = { stdinResumed: false, terminationRequested: false };
  installStdinShutdown({
    onStdinEnd: (listener) => {
      observed.stdinEndListener = listener;
    },
    requestTermination: () => {
      observed.terminationRequested = true;
    },
    resumeStdin: () => {
      observed.stdinResumed = true;
    },
  });

  expect(observed.stdinResumed).toBe(true);
  expect(observed.stdinEndListener).toBeTypeOf("function");
  observed.stdinEndListener?.();
  expect(observed.terminationRequested).toBe(true);
});
