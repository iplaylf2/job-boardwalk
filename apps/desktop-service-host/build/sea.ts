import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const serviceHostDirectory = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(serviceHostDirectory, "../..");
const executableName = process.platform === "win32" ? "node-service-host.exe" : "node-service-host";
const executablePath = path.join(repositoryRoot, "target", "release", executableName);
const seaConfigPath = path.join(serviceHostDirectory, "dist", "sea-config.json");
const bundledRuntimePath = path.join(serviceHostDirectory, "dist", "desktop-service-host.cjs");
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
  cwd: serviceHostDirectory,
});
process.stdout.write(stdout);
process.stderr.write(stderr);
