import { defineConfig } from "oxlint";
import shared from "@job-boardwalk/presets/oxlint.shared.ts";
import testShared from "@job-boardwalk/presets/test.oxlint.shared.ts";

export default defineConfig({
  env: { browser: true },
  extends: [shared],
  overrides: [
    {
      files: ["test/**/*.ts"],
      rules: testShared,
    },
  ],
});
