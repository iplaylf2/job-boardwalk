import { defineConfig } from "oxlint";
import shared from "@job-boardwalk/presets/oxlint.shared.ts";

export default defineConfig({
  env: { "shared-node-browser": true },
  extends: [shared],
});
