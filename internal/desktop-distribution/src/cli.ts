#!/usr/bin/env node

import path from "node:path";

import { assembleDesktopProduct } from "#/assemble.ts";
import { createDesktopAssemblyPlan } from "#/assembly-plan.ts";
import { readDesktopManagerVersion } from "#/desktop-manager-version.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const productVersion = await readDesktopManagerVersion(repositoryRoot);
const plan = createDesktopAssemblyPlan({ productVersion, repositoryRoot });
const result = await assembleDesktopProduct(plan);

process.stdout.write(`${result.productDirectory}\n`);
