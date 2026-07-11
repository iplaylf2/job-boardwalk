import { randomUUID } from "node:crypto";
import { chmod, rename, rm, writeFile } from "node:fs/promises";

import { getLoginReceiptPath } from "#/session-storage.js";
import type { PlatformName } from "#/platforms.js";

export interface LoginReceipt {
  authenticatedAt: string;
  platform: PlatformName;
  state: "persisted";
}

const jsonIndentationSpaces = 2;
const receiptFileMode = 0o600;

export async function writeLoginReceiptFile(
  receiptPath: string,
  receipt: LoginReceipt,
): Promise<void> {
  const temporaryPath = `${receiptPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, jsonIndentationSpaces)}\n`, {
      mode: receiptFileMode,
    });
    await chmod(temporaryPath, receiptFileMode);
    await rename(temporaryPath, receiptPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function persistLoginReceipt(
  platform: PlatformName,
  authenticatedAt: string,
): Promise<LoginReceipt> {
  const receipt = {
    authenticatedAt,
    platform,
    state: "persisted",
  } as const;
  await writeLoginReceiptFile(getLoginReceiptPath(platform), receipt);
  return receipt;
}
