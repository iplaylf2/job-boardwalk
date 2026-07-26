import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const desktopRuntimeDirectory = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(desktopRuntimeDirectory, "../..");
const executableName =
  process.platform === "win32"
    ? "job-boardwalk-desktop-runtime.exe"
    : "job-boardwalk-desktop-runtime";
const executablePath = path.join(repositoryRoot, "target", "release", executableName);
const seaConfigPath = path.join(desktopRuntimeDirectory, "dist", "sea-config.json");
const bundledRuntimePath = path.join(desktopRuntimeDirectory, "dist", "desktop-runtime.cjs");
const manifestIndentationSpaces = 2;
const executeFile = promisify(execFile);

await mkdir(path.dirname(executablePath), { recursive: true });
await writeFile(
  seaConfigPath,
  `${JSON.stringify(
    {
      disableExperimentalSEAWarning: true,
      execArgvExtension: "none",
      main: bundledRuntimePath,
      output: executablePath,
      useCodeCache: false,
      useSnapshot: false,
    },
    null,
    manifestIndentationSpaces,
  )}\n`,
);
const { stderr, stdout } = await executeFile(process.execPath, [`--build-sea=${seaConfigPath}`], {
  cwd: desktopRuntimeDirectory,
});
process.stdout.write(stdout);
process.stderr.write(stderr);
