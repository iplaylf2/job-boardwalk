import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { run } from "@shajara/host";
import { writeLoginReceiptFile } from "#/login/receipt.js";
import { afterEach, describe, expect, test } from "vitest";

const permissionMask = 0o777;
const permissionBoundary = 0o1000;
const privateFileMode = 0o600;
const firstArrayIndex = 0;
const jsonIndentationSpaces = 2;
const temporaryDirectories: string[] = [];

describe("login receipt persistence", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(firstArrayIndex)
        .map((directory) => rm(directory, { recursive: true })),
    );
  });

  test("atomically writes a reusable result with private POSIX permissions", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "job-boardwalk-status-"));
    temporaryDirectories.push(directory);
    const receiptPath = path.join(directory, "boss-login-receipt.json");
    const receipt = {
      authenticatedAt: "2026-07-11T00:00:00.000Z",
      platform: "boss",
      state: "persisted",
    } as const;
    await writeFile(receiptPath, "stale\n", { mode: permissionMask });

    await run(() => writeLoginReceiptFile(receiptPath, receipt));

    await expect(readFile(receiptPath, "utf8")).resolves.toBe(
      `${JSON.stringify(receipt, null, jsonIndentationSpaces)}\n`,
    );
    await expect(readdir(directory)).resolves.toEqual(["boss-login-receipt.json"]);
    if (process.platform !== "win32") {
      const metadata = await stat(receiptPath);
      expect(metadata.mode % permissionBoundary).toBe(privateFileMode);
    }
  });
});
