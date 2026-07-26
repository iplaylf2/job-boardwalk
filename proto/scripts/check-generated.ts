import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const protocolRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(protocolRoot, "..");
const bufExecutable = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "buf.CMD" : "buf",
);

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

async function compareGeneratedTree(
  expectedDirectory: string,
  generatedDirectory: string,
): Promise<string[]> {
  const expectedFiles = await filesBelow(expectedDirectory);
  const generatedFiles = await filesBelow(generatedDirectory);
  const paths = new Set([...expectedFiles, ...generatedFiles]);
  const drifted: string[] = [];
  for (const relativePath of paths) {
    const [expected, generated] = await Promise.all([
      readFile(path.join(expectedDirectory, relativePath)).catch(() => null),
      readFile(path.join(generatedDirectory, relativePath)).catch(() => null),
    ]);
    if (expected === null || generated === null || !expected.equals(generated)) {
      drifted.push(path.relative(repositoryRoot, path.join(expectedDirectory, relativePath)));
    }
  }
  return drifted;
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "job-boardwalk-protocol-"));
try {
  const temporaryProtocolRoot = path.join(temporaryRoot, "proto");
  await mkdir(temporaryProtocolRoot);
  await executeFile(
    bufExecutable,
    ["generate", "--template", path.join(protocolRoot, "buf.gen.yaml"), protocolRoot],
    {
      cwd: temporaryProtocolRoot,
    },
  );
  const drifted = (
    await Promise.all([
      compareGeneratedTree(
        path.join(repositoryRoot, "apps/desktop-runtime/src/generated"),
        path.join(temporaryRoot, "apps/desktop-runtime/src/generated"),
      ),
      compareGeneratedTree(
        path.join(repositoryRoot, "apps/desktop-manager/src/generated"),
        path.join(temporaryRoot, "apps/desktop-manager/src/generated"),
      ),
    ])
  ).flat();
  if (drifted.length > 0) {
    process.stderr.write(`${drifted.join("\n")}\n`);
    process.exitCode = 1;
  }
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
