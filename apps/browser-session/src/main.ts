import process from "node:process";

import { runBrowserSessionProcess } from "./runtime.js";

const browserExecutablePath = process.argv
  .find((argument) => argument.startsWith("--browser-executable-path="))
  ?.slice("--browser-executable-path=".length);
const profilePath = process.argv
  .find((argument) => argument.startsWith("--browser-profile-path="))
  ?.slice("--browser-profile-path=".length);

// oxlint-disable-next-line unicorn/prefer-top-level-await -- The desktop payload is a loadable CommonJS role module.
runBrowserSessionProcess({
  ...(browserExecutablePath ? { browserExecutablePath } : {}),
  ...(profilePath ? { profilePath } : {}),
}).catch((error: unknown) => {
  process.stderr.write(`[Browser Session] ${String(error)}\n`);
  process.exitCode = 1;
});
