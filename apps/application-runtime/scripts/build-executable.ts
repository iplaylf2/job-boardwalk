import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const applicationDirectory = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(applicationDirectory, "../..");
const executableName =
  process.platform === "win32" ? "job-boardwalk-runtime.exe" : "job-boardwalk-runtime";
const executablePath = path.join(repositoryRoot, "target", "release", executableName);
const seaConfigPath = path.join(applicationDirectory, "dist", "sea-config.json");
const bundledRuntimePath = path.join(applicationDirectory, "dist", "application-runtime.cjs");
const successfulExitCode = 0;
const manifestIndentationSpaces = 2;
const executableFileMode = 0o755;

async function executeNode(arguments_: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, arguments_, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === successfulExitCode) {
        resolve();
      } else {
        reject(
          new Error(
            `Node single-executable build failed (${signal ? `signal ${signal}` : `exit ${code}`}): ${arguments_.join(" ")}`,
          ),
        );
      }
    });
  });
}

await mkdir(path.dirname(executablePath), { recursive: true });
await rm(executablePath, { force: true });
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
await executeNode([`--build-sea=${seaConfigPath}`]);
if (process.platform !== "win32") {
  await chmod(executablePath, executableFileMode);
}
