import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { arch, platform } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

interface ProductManifest {
  readonly productVersion: string;
}

type ExecutePackager = (
  executable: string,
  arguments_: readonly string[],
  environment?: NodeJS.ProcessEnv,
) => Promise<void>;

export interface PortableArchiveOptions {
  readonly outputDirectory: string;
  readonly productDirectory: string;
}

const executeFile = promisify(execFile);

async function executeNativePackager(
  executable: string,
  arguments_: readonly string[],
  environment?: NodeJS.ProcessEnv,
): Promise<void> {
  await executeFile(executable, arguments_, { env: environment });
}

function archivePlatformName(nativePlatform: NodeJS.Platform): string {
  return nativePlatform === "win32" ? "windows" : nativePlatform;
}

function archiveExtension(nativePlatform: NodeJS.Platform): string {
  return nativePlatform === "win32" ? ".zip" : ".tar.gz";
}

async function invokePlatformPackager(
  nativePlatform: NodeJS.Platform,
  productDirectory: string,
  archivePath: string,
  executePackager: ExecutePackager,
): Promise<void> {
  if (nativePlatform === "linux") {
    await executePackager("tar", [
      "--create",
      "--gzip",
      "--file",
      archivePath,
      "--directory",
      path.dirname(productDirectory),
      path.basename(productDirectory),
    ]);
    return;
  }
  if (nativePlatform === "win32") {
    await executePackager(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath $env:JOB_BOARDWALK_PRODUCT_DIRECTORY -DestinationPath $env:JOB_BOARDWALK_ARCHIVE_PATH -CompressionLevel Optimal",
      ],
      {
        ...process.env,
        JOB_BOARDWALK_ARCHIVE_PATH: archivePath,
        JOB_BOARDWALK_PRODUCT_DIRECTORY: productDirectory,
      },
    );
    return;
  }
  throw new Error(`Portable desktop archives are not supported on ${nativePlatform}.`);
}

async function replaceArchive(temporaryArchive: string, archivePath: string): Promise<void> {
  await rm(archivePath, { force: true });
  await rename(temporaryArchive, archivePath);
}

export async function createPortableArchive(
  options: PortableArchiveOptions,
  executePackager: ExecutePackager = executeNativePackager,
): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(options.productDirectory, "manifest.json"), "utf8"),
  ) as ProductManifest;
  const nativePlatform = platform();
  const baseName = `job-boardwalk-${manifest.productVersion}-${archivePlatformName(nativePlatform)}-${arch()}`;
  const extension = archiveExtension(nativePlatform);
  const archivePath = path.join(options.outputDirectory, `${baseName}${extension}`);
  await mkdir(options.outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(options.outputDirectory, ".package-"));
  const temporaryArchive = path.join(temporaryDirectory, `${baseName}${extension}`);
  try {
    await invokePlatformPackager(
      nativePlatform,
      options.productDirectory,
      temporaryArchive,
      executePackager,
    );
    await replaceArchive(temporaryArchive, archivePath);
    return archivePath;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}
