#!/usr/bin/env node

import { arch, platform } from "node:os";
import path from "node:path";

import { desktopDistributionRoot, productDirectoryName } from "#/assembly-plan.ts";
import { createPortableArchive } from "#/package.ts";
import { readProductVersion } from "#/product-version.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const distributionRoot = desktopDistributionRoot(repositoryRoot);
const productVersion = await readProductVersion();
const archivePath = await createPortableArchive({
  outputDirectory: path.join(distributionRoot, "releases"),
  productDirectory: path.join(distributionRoot, `${platform()}-${arch()}`, productDirectoryName),
  productVersion,
});
process.stdout.write(`${archivePath}\n`);
