import { randomUUID } from "node:crypto";
import { chmod, rename, rm, writeFile } from "node:fs/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

import { getLoginReceiptPath } from "#/session-storage.js";
import type { PlatformName } from "#/platforms.js";

export interface LoginReceipt {
  authenticatedAt: string;
  platform: PlatformName;
  state: "persisted";
}

const jsonIndentationSpaces = 2;
const receiptFileMode = 0o600;

export function* writeLoginReceiptFile(
  receiptPath: string,
  receipt: LoginReceipt,
): RiteCoroutine<void> {
  const temporaryPath = `${receiptPath}.${randomUUID()}.tmp`;
  try {
    yield* until(() =>
      writeFile(temporaryPath, `${JSON.stringify(receipt, null, jsonIndentationSpaces)}\n`, {
        mode: receiptFileMode,
      }),
    );
    yield* until(() => chmod(temporaryPath, receiptFileMode));
    yield* until(() => rename(temporaryPath, receiptPath));
  } finally {
    yield* until(() => rm(temporaryPath, { force: true }));
  }
}

export function* persistLoginReceipt(
  platform: PlatformName,
  authenticatedAt: string,
): RiteCoroutine<LoginReceipt> {
  const receipt = {
    authenticatedAt,
    platform,
    state: "persisted",
  } as const;
  yield* writeLoginReceiptFile(getLoginReceiptPath(platform), receipt);
  return receipt;
}
