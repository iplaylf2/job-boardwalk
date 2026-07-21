import { defineConfig } from "oxlint";
import shared from "@job-boardwalk/presets/oxlint.shared.ts";

export default defineConfig({
  env: { node: true },
  extends: [shared],
  rules: {
    "import/no-nodejs-modules": "off",
  },
});
