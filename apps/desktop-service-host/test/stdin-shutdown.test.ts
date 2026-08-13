import { expect, test } from "vitest";

import { installStdinShutdown, requestServiceTermination } from "#/stdin-shutdown.js";

const expectedPauseCount = 1;

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
    pauseCount: number;
    removedStdinEndListener?: () => void;
    stdinEndListener?: () => void;
    stdinResumed: boolean;
    terminationRequested: boolean;
  } = { pauseCount: 0, stdinResumed: false, terminationRequested: false };
  const removeShutdownAdapter = installStdinShutdown({
    onStdinEnd: (listener) => {
      observed.stdinEndListener = listener;
    },
    pauseStdin: () => {
      observed.pauseCount += 1;
    },
    removeStdinEndListener: (listener) => {
      observed.removedStdinEndListener = listener;
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

  removeShutdownAdapter();
  expect(observed.removedStdinEndListener).toBe(observed.stdinEndListener);
  expect(observed.pauseCount).toBe(expectedPauseCount);
});
