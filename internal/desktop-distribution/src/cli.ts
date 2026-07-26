#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { assembleDesktopProduct } from "#/assemble.ts";
import { createDesktopAssemblyPlan } from "#/assembly-plan.ts";
import { readDesktopManagerVersion } from "#/desktop-manager-version.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const executeFile = promisify(execFile);
const productVersion = await readDesktopManagerVersion(repositoryRoot);
const caddyExecutable = process.env["JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE"];
if (!caddyExecutable || !path.isAbsolute(caddyExecutable)) {
  throw new Error(
    "JOB_BOARDWALK_DESKTOP_CADDY_EXECUTABLE must name an absolute, platform-native Caddy executable.",
  );
}
await executeFile(
  caddyExecutable,
  [
    "validate",
    "--config",
    path.join(repositoryRoot, "apps", "dashboard", "Caddyfile"),
    "--adapter",
    "caddyfile",
  ],
  {
    env: {
      ...process.env,
      JOB_BOARDWALK_DASHBOARD_DIRECTORY: path.join(repositoryRoot, "apps", "dashboard", "dist"),
    },
  },
);
const plan = createDesktopAssemblyPlan({ caddyExecutable, productVersion, repositoryRoot });
const result = await assembleDesktopProduct(plan);

process.stdout.write(`${result.productDirectory}\n`);
