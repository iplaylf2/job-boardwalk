import { expect, test, vi } from "vitest";

import { runServiceRole } from "#/service-role.js";

test("retains stdin until the loaded service completes", async () => {
  const serviceCompletion = Promise.resolve();
  const removeShutdownAdapter = vi.fn();
  const roleCompletion = runServiceRole("/synthetic/service-entrypoint", {
    installShutdown: () => removeShutdownAdapter,
    loadModule: () => ({ serviceCompletion }),
  });

  expect(removeShutdownAdapter).not.toHaveBeenCalled();
  await expect(roleCompletion).resolves.toBeUndefined();
  expect(removeShutdownAdapter).toHaveBeenCalledOnce();
});

test("stops retaining stdin when the loaded service rejects", async () => {
  const failure = new Error("Synthetic service failure");
  const removeShutdownAdapter = vi.fn();

  await expect(
    runServiceRole("/synthetic/service-entrypoint", {
      installShutdown: () => removeShutdownAdapter,
      loadModule: () => ({ serviceCompletion: Promise.reject(failure) }),
    }),
  ).rejects.toBe(failure);

  expect(removeShutdownAdapter).toHaveBeenCalledOnce();
});

test("rejects a loaded module without the service lifecycle contract", () => {
  expect(() =>
    runServiceRole("/synthetic/service-entrypoint", {
      installShutdown: vi.fn(),
      loadModule: () => ({}),
    }),
  ).toThrow("The desktop service entrypoint must export serviceCompletion.");
});
