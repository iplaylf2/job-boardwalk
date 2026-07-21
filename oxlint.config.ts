/// <reference types="node" />
import { defineConfig } from "oxlint";

import { execFileSync } from "node:child_process";
import path from "node:path";

import shared from "@job-boardwalk/presets/oxlint.shared.ts";

export default defineConfig({
  env: { node: true },
  extends: [shared],
  ignorePatterns: workspaceIgnorePatterns(),
  rules: {
    "import/no-nodejs-modules": "off",
  },
});

function workspaceIgnorePatterns(): string[] {
  const output = execFileSync("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
    encoding: "utf8",
  });

  return (JSON.parse(output) as PnpmWorkspace[])
    .map((workspace) => path.relative(import.meta.dirname, workspace.path))
    .filter((location) => location !== "")
    .map((location) => `${location.split(path.sep).join("/")}/**`);
}

interface PnpmWorkspace {
  path: string;
}
