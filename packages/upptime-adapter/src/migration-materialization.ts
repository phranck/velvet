import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  parseVelvetConfiguration,
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "@velvet/contracts";
import { readMonitorState } from "@velvet/monitor";

import { UpptimeAdapterError } from "./errors.js";
import type { UpptimeMigrationResult } from "./migration-types.js";

export interface UpptimeMigrationMaterializationDependencies {
  beforePublish?: () => Promise<void>;
}

export function serializeUpptimeMigration(
  migration: UpptimeMigrationResult,
): ReadonlyMap<string, string> {
  if (
    !parseVelvetConfiguration(migration.configurationYaml).success ||
    !validateStatusDocument(migration.documents.status).success ||
    !validateResponseTimesDocument(migration.documents.responseTimes).success ||
    !validateIncidentsDocument(migration.documents.incidents).success ||
    JSON.stringify(migration.state.documents.status) !==
      JSON.stringify(migration.documents.status) ||
    JSON.stringify(migration.state.documents.responseTimes) !==
      JSON.stringify(migration.documents.responseTimes)
  ) {
    throw new UpptimeAdapterError(
      "CONTRACT_VALIDATION_FAILED",
      "Migration output failed validation",
    );
  }
  return new Map([
    ["velvet.yml", migration.configurationYaml],
    [
      ".velvet/monitor-state.json",
      `${JSON.stringify(migration.state, null, 2)}\n`,
    ],
    [
      "velvet-data/v1/status.json",
      `${JSON.stringify(migration.documents.status, null, 2)}\n`,
    ],
    [
      "velvet-data/v1/response-times.json",
      `${JSON.stringify(migration.documents.responseTimes, null, 2)}\n`,
    ],
    [
      "velvet-data/v1/incidents.json",
      `${JSON.stringify(migration.documents.incidents, null, 2)}\n`,
    ],
    ["migration-report.json", `${JSON.stringify(migration.report, null, 2)}\n`],
    ["MIGRATION_REPORT.md", migration.reportMarkdown],
  ]);
}

async function validateStagingDirectory(
  directory: string,
  migration: UpptimeMigrationResult,
): Promise<void> {
  try {
    const state = await readMonitorState(
      join(directory, ".velvet", "monitor-state.json"),
    );
    const configuration = parseVelvetConfiguration(
      await readFile(join(directory, "velvet.yml"), "utf8"),
    );
    const status = JSON.parse(
      await readFile(join(directory, "velvet-data", "v1", "status.json"), "utf8"),
    ) as unknown;
    const responseTimes = JSON.parse(
      await readFile(
        join(directory, "velvet-data", "v1", "response-times.json"),
        "utf8",
      ),
    ) as unknown;
    const incidents = JSON.parse(
      await readFile(
        join(directory, "velvet-data", "v1", "incidents.json"),
        "utf8",
      ),
    ) as unknown;
    const report = JSON.parse(
      await readFile(join(directory, "migration-report.json"), "utf8"),
    ) as unknown;
    if (
      state === null ||
      !configuration.success ||
      !validateStatusDocument(status).success ||
      !validateResponseTimesDocument(responseTimes).success ||
      !validateIncidentsDocument(incidents).success ||
      JSON.stringify(state) !== JSON.stringify(migration.state) ||
      JSON.stringify(report) !== JSON.stringify(migration.report)
    ) {
      throw new Error("invalid migration output");
    }
  } catch (cause) {
    throw new UpptimeAdapterError(
      "CONTRACT_VALIDATION_FAILED",
      "Materialized migration output failed validation",
      { cause },
    );
  }
}

async function destinationState(
  destination: string,
): Promise<"absent" | "empty"> {
  try {
    const status = await lstat(destination);
    if (!status.isDirectory() || (await readdir(destination)).length > 0) {
      throw new UpptimeAdapterError(
        "DESTINATION_NOT_EMPTY",
        "Migration destination must be new or empty",
      );
    }
    return "empty";
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return "absent";
    }
    throw error;
  }
}

export async function materializeUpptimeMigration(
  destination: string,
  migration: UpptimeMigrationResult,
  dependencies: UpptimeMigrationMaterializationDependencies = {},
): Promise<void> {
  if (destination.trim().length === 0) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Migration destination is required",
    );
  }
  const resolvedDestination = resolve(destination);
  await destinationState(resolvedDestination);
  const parent = dirname(resolvedDestination);
  const outputName = basename(resolvedDestination);
  await mkdir(parent, { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(parent, `.${outputName}.staging-`),
  );

  try {
    const files = serializeUpptimeMigration(migration);
    await Promise.all(
      [...files.entries()].map(async ([path, contents]) => {
        const filePath = join(stagingDirectory, path);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, contents, "utf8");
      }),
    );
    await validateStagingDirectory(stagingDirectory, migration);
    await dependencies.beforePublish?.();
    if ((await destinationState(resolvedDestination)) === "empty") {
      try {
        await rmdir(resolvedDestination);
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          ["EEXIST", "ENOTDIR", "ENOTEMPTY"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        ) {
          throw new UpptimeAdapterError(
            "DESTINATION_NOT_EMPTY",
            "Migration destination must be new or empty",
          );
        }
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            (error as NodeJS.ErrnoException).code === "ENOENT"
          )
        ) {
          throw error;
        }
      }
    }
    await rename(stagingDirectory, resolvedDestination);
  } catch (error) {
    if (error instanceof UpptimeAdapterError) throw error;
    throw new UpptimeAdapterError(
      "DESTINATION_WRITE_FAILED",
      "Migration destination could not be written",
      { cause: error },
    );
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}
