import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { serializeVelvetDocuments } from "./serialization.js";
import type { VelvetDocuments } from "./types.js";

export async function materializeVelvetDocuments(
  outputDirectory: string,
  documents: VelvetDocuments,
): Promise<void> {
  const files = serializeVelvetDocuments(documents);
  const resolvedOutputDirectory = resolve(outputDirectory);
  const parentDirectory = dirname(resolvedOutputDirectory);
  const outputName = basename(resolvedOutputDirectory);
  await mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(parentDirectory, `.${outputName}.staging-`),
  );
  const previousDirectory = `${stagingDirectory}.previous`;
  let movedPreviousSnapshot = false;

  try {
    await Promise.all(
      Object.entries(files).map(([fileName, contents]) =>
        writeFile(join(stagingDirectory, fileName), contents, "utf8"),
      ),
    );

    try {
      await rename(resolvedOutputDirectory, previousDirectory);
      movedPreviousSnapshot = true;
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    try {
      await rename(stagingDirectory, resolvedOutputDirectory);
    } catch (error) {
      if (movedPreviousSnapshot) {
        await rename(previousDirectory, resolvedOutputDirectory);
        movedPreviousSnapshot = false;
      }
      throw error;
    }

    if (movedPreviousSnapshot) {
      await rm(previousDirectory, { recursive: true, force: true });
      movedPreviousSnapshot = false;
    }
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
