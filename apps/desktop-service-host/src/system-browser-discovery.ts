import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const firstMatchIndex = 0;
const successfulExitCode = 0;

export interface SystemBrowserCandidate {
  readonly executablePath: string;
  readonly family: "Chrome" | "Edge";
}

export type SystemBrowserDiscovery =
  | {
      readonly detail: string;
      readonly executablePath: string;
      readonly family: "Chrome" | "Edge";
      readonly state: "recognized";
      readonly version: string;
    }
  | {
      readonly detail: string;
      readonly state: "missing";
    }
  | {
      readonly detail: string;
      readonly executablePath: string;
      readonly family: "Chrome" | "Edge";
      readonly state: "uninspectable";
      readonly version: string;
    };

function systemBrowserCandidate(
  family: SystemBrowserCandidate["family"],
  executablePath: string,
): SystemBrowserCandidate {
  return { executablePath: path.resolve(executablePath), family };
}

export function systemBrowserCandidates(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): SystemBrowserCandidate[] {
  const configured = environment["JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH"]?.trim();
  if (configured) {
    const family = /edge/iu.test(path.basename(configured)) ? "Edge" : "Chrome";
    return [systemBrowserCandidate(family, configured)];
  }
  if (platform === "darwin") {
    return [
      systemBrowserCandidate(
        "Chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ),
      systemBrowserCandidate(
        "Edge",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ),
    ];
  }
  if (platform === "win32") {
    const roots = [
      environment["PROGRAMFILES"],
      environment["PROGRAMFILES(X86)"],
      environment["LOCALAPPDATA"],
    ].filter((root): root is string => Boolean(root?.trim()));
    return roots.flatMap((root) => [
      systemBrowserCandidate(
        "Chrome",
        path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      ),
      systemBrowserCandidate(
        "Edge",
        path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      ),
    ]);
  }
  return [
    systemBrowserCandidate("Chrome", "/usr/bin/google-chrome"),
    systemBrowserCandidate("Chrome", "/usr/bin/google-chrome-stable"),
    systemBrowserCandidate("Chrome", "/opt/google/chrome/chrome"),
    systemBrowserCandidate("Edge", "/usr/bin/microsoft-edge"),
    systemBrowserCandidate("Edge", "/usr/bin/microsoft-edge-stable"),
    systemBrowserCandidate("Edge", "/opt/microsoft/msedge/msedge"),
  ];
}

function classifyVersionOutput(
  candidate_: SystemBrowserCandidate,
  versionOutput: string,
): SystemBrowserDiscovery {
  const versionMatch = versionOutput.match(/(?<major>\d+)(?:\.\d+){1,3}/u);
  const version = versionMatch?.[firstMatchIndex];
  const major = versionMatch?.groups?.["major"];
  const majorVersion = major ? Math.trunc(Number(major)) : Number.NaN;
  if (!version || !Number.isSafeInteger(majorVersion)) {
    return {
      detail: `${candidate_.family} did not report a recognizable version.`,
      executablePath: candidate_.executablePath,
      family: candidate_.family,
      state: "uninspectable",
      version: versionOutput.trim() || "unknown",
    };
  }
  return {
    detail: `${candidate_.family} ${version} was detected.`,
    executablePath: candidate_.executablePath,
    family: candidate_.family,
    state: "recognized",
    version,
  };
}

function readBrowserVersion(executablePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executablePath, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === successfulExitCode) {
        resolve(output);
      } else {
        reject(new Error(`browser version command failed (${signal ?? `exit ${code}`})`));
      }
    });
  });
}

export async function discoverSystemBrowser(
  candidates: readonly SystemBrowserCandidate[] = systemBrowserCandidates(),
  inspectVersion: (executablePath: string) => Promise<string> = readBrowserVersion,
): Promise<SystemBrowserDiscovery> {
  async function inspectCandidate(
    browserCandidate: SystemBrowserCandidate,
  ): Promise<SystemBrowserDiscovery | null> {
    try {
      await access(browserCandidate.executablePath);
    } catch {
      return null;
    }
    try {
      return classifyVersionOutput(
        browserCandidate,
        await inspectVersion(browserCandidate.executablePath),
      );
    } catch (error) {
      return {
        detail: `${browserCandidate.family} could not report its version: ${String(error)}`,
        executablePath: browserCandidate.executablePath,
        family: browserCandidate.family,
        state: "uninspectable",
        version: "unknown",
      };
    }
  }
  const results = await Promise.all(candidates.map((candidate_) => inspectCandidate(candidate_)));
  const recognized = results.find((result) => result?.state === "recognized");
  const uninspectable = results.find((result) => result?.state === "uninspectable");
  return (
    recognized ??
    uninspectable ?? {
      detail: "No Google Chrome or Microsoft Edge installation was found.",
      state: "missing",
    }
  );
}
