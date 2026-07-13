import path from "node:path";

import { getBrowserSessionDirectory, preparePrivateDirectory } from "@job-boardwalk/storage-layout";
import type { RiteCoroutine } from "@shajara/host";

const artifactsDirectoryName = "artifacts";
const profileDirectoryName = "profile";

export function* prepareBrowserStorage(): RiteCoroutine<{
  artifactsDirectory: string;
  profileDirectory: string;
}> {
  const browserSessionDirectory = getBrowserSessionDirectory();
  const artifactsDirectory = path.join(browserSessionDirectory, artifactsDirectoryName);
  const profileDirectory = path.join(browserSessionDirectory, profileDirectoryName);
  yield* preparePrivateDirectory(browserSessionDirectory);
  yield* preparePrivateDirectory(artifactsDirectory);
  yield* preparePrivateDirectory(profileDirectory);
  return { artifactsDirectory, profileDirectory };
}
