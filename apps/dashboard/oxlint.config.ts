import { defineConfig } from "oxlint";
import shared from "@job-boardwalk/presets/oxlint.shared.ts";

export default defineConfig({
  env: { browser: true },
  extends: [shared],
});
