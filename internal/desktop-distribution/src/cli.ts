#!/usr/bin/env node

import path from "node:path";

import { assembleDesktopDistribution } from "#/assemble.ts";
import { createDesktopDistributionPlan } from "#/distribution-layout.ts";
import { readDesktopManagerVersion } from "#/product-metadata.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const productVersion = await readDesktopManagerVersion(repositoryRoot);
const plan = createDesktopDistributionPlan({ productVersion, repositoryRoot });
const result = await assembleDesktopDistribution(plan);

process.stdout.write(`${result.productDirectory}\n`);
