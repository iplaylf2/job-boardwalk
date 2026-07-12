import { randomUUID } from "node:crypto";
import { chmod, rename, rm, writeFile } from "node:fs/promises";

import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import type { LoginReceipt, PlatformName } from "@job-boardwalk/platforms";

import { getLoginReceiptPath } from "#/authentication-storage.js";

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
