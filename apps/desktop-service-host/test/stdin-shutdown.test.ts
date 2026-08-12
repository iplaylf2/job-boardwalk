import { expect, test } from "vitest";

import { installStdinShutdown, requestServiceTermination } from "#/stdin-shutdown.js";

test("dispatches termination through the process's SIGTERM event", () => {
  const observed: { event?: string; signal?: string } = {};

  requestServiceTermination({
    emit: (event, signal) => {
      observed.event = event;
      observed.signal = signal;
      return true;
    },
  });

  expect(observed).toEqual({ event: "SIGTERM", signal: "SIGTERM" });
});

test("adapts Desktop Manager stdin closure to service termination", () => {
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
