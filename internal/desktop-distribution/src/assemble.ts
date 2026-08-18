import { cp, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { productDirectoryName } from "#/assembly-plan.ts";
import type { AssemblyComponent, DesktopAssemblyPlan } from "#/assembly-plan.ts";

export interface AssemblyResult {
  readonly productDirectory: string;
}

function validateDestination(destination: string): void {
  const normalized = path.normalize(destination);
  if (
    path.isAbsolute(destination) ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`Component destination escapes the product directory: ${destination}`);
  }
}

async function copyComponent(
  stagingDirectory: string,
  component: AssemblyComponent,
): Promise<void> {
  validateDestination(component.destination);
  const destination = path.join(stagingDirectory, component.destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(component.source, destination, { dereference: true, recursive: true });
}

async function validateProductTree(root: string): Promise<void> {
  async function visit(relativeDirectory: string): Promise<void> {
    const directory = path.join(root, relativeDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const relativePath = path.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
          await visit(relativePath);
        } else if (!entry.isFile()) {
          throw new Error(
            `Product artifacts must be regular files or directories: ${relativePath}`,
          );
        }
      }),
    );
  }

  await visit("");
}

export async function assembleDesktopProduct(plan: DesktopAssemblyPlan): Promise<AssemblyResult> {
  await mkdir(plan.outputRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(plan.outputRoot, ".assemble-"));
  const stagingDirectory = path.join(temporaryDirectory, productDirectoryName);
  const productDirectory = path.join(plan.outputRoot, productDirectoryName);

  try {
    await mkdir(path.join(stagingDirectory, "data"), { recursive: true });
    await Promise.all(
      plan.components.map((component) => copyComponent(stagingDirectory, component)),
    );
    await validateProductTree(stagingDirectory);
    await rm(productDirectory, { force: true, recursive: true });
    await rename(stagingDirectory, productDirectory);
    return { productDirectory };
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}
