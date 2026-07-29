import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "bun:test";

import * as adapter from "../src/index.js";
import type {
  UpptimeMigrationResult,
  UpptimeSnapshot,
} from "../src/index.js";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function snapshot(): UpptimeSnapshot {
  return {
    configYaml: `
owner: example
repo: status
sites:
  - name: Website
    slug: website
    url: https://example.invalid/health
`,
    summaryJson: JSON.stringify([
      {
        name: "Website",
        slug: "website",
        status: "up",
        time: 125,
        dailyMinutesDown: {},
      },
    ]),
    histories: {
      website:
        "status: up\nresponseTime: 125\nlastUpdated: 2026-07-29T11:59:00.000Z\nstartTime: 2026-07-28T00:00:00.000Z\n",
    },
    commits: {
      website: [
        {
          sha: "history-1",
          committedAt: "2026-07-29T11:59:00.000Z",
          message: "Website is up (200 in 125 ms) [upptime]",
        },
      ],
    },
    issues: [],
  };
}

function migration(sourceSnapshot = snapshot()): UpptimeMigrationResult {
  const candidate = Reflect.get(adapter, "createUpptimeMigration");
  if (typeof candidate !== "function") {
    assert.fail("createUpptimeMigration must be exported");
  }
  return candidate(sourceSnapshot, {
    repository: "example/status",
    ref: "main",
    commit: SOURCE_COMMIT,
    committedAt: "2026-07-29T12:00:00.000Z",
  }) as UpptimeMigrationResult;
}

async function materialize(
  destination: string,
  result: UpptimeMigrationResult,
  dependencies?: { beforePublish: () => Promise<void> },
): Promise<void> {
  const candidate = Reflect.get(adapter, "materializeUpptimeMigration");
  if (typeof candidate !== "function") {
    assert.fail("materializeUpptimeMigration must be exported");
  }
  await candidate(destination, result, dependencies);
}

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "velvet-migration-"));
  temporaryDirectories.push(directory);
  return directory;
}

test("materializes one complete validated migration bundle", async () => {
  const root = await temporaryRoot();
  const destination = join(root, "output");
  const result = migration();

  await materialize(destination, result);

  assert.deepEqual((await readdir(destination)).sort(), [
    ".velvet",
    "MIGRATION_REPORT.md",
    "migration-report.json",
    "velvet-data",
    "velvet.yml",
  ]);
  assert.equal(
    await readFile(join(destination, "velvet.yml"), "utf8"),
    result.configurationYaml,
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        join(destination, ".velvet", "monitor-state.json"),
        "utf8",
      ),
    ),
    result.state,
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(join(destination, "migration-report.json"), "utf8"),
    ),
    result.report,
  );
});

test("accepts an existing empty destination but never a non-empty one", async () => {
  const root = await temporaryRoot();
  const emptyDestination = join(root, "empty");
  await mkdir(emptyDestination);

  await materialize(emptyDestination, migration());
  assert.equal((await readdir(emptyDestination)).length, 5);

  const occupiedDestination = join(root, "occupied");
  await mkdir(occupiedDestination);
  await writeFile(join(occupiedDestination, "keep.txt"), "keep\n", "utf8");
  await assert.rejects(
    materialize(occupiedDestination, migration()),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DESTINATION_NOT_EMPTY",
  );
  assert.equal(
    await readFile(join(occupiedDestination, "keep.txt"), "utf8"),
    "keep\n",
  );
});

test("leaves no partial destination when publication fails", async () => {
  const root = await temporaryRoot();
  const destination = join(root, "output");

  await assert.rejects(
    materialize(destination, migration(), {
      beforePublish: async () => {
        throw new Error("simulated interruption");
      },
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DESTINATION_WRITE_FAILED" &&
      !error.message.includes("simulated interruption"),
  );

  assert.deepEqual(await readdir(root), []);
});

test("never removes files added to an initially empty destination", async () => {
  const root = await temporaryRoot();
  const destination = join(root, "output");
  await mkdir(destination);

  await assert.rejects(
    materialize(destination, migration(), {
      beforePublish: async () => {
        await writeFile(join(destination, "keep.txt"), "keep\n", "utf8");
      },
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DESTINATION_NOT_EMPTY",
  );

  assert.equal(
    await readFile(join(destination, "keep.txt"), "utf8"),
    "keep\n",
  );
});

test("refuses to materialize a migration with an unresolved legacy incident", async () => {
  const root = await temporaryRoot();
  const destination = join(root, "output");
  const sourceSnapshot = snapshot();
  sourceSnapshot.issues = [
    {
      number: 9,
      title: "Website is down",
      body: "Investigating the outage.",
      state: "open",
      createdAt: "2026-07-29T10:00:00.000Z",
      closedAt: null,
      labels: ["status", "website"],
    },
  ];

  await assert.rejects(
    materialize(destination, migration(sourceSnapshot)),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_INPUT",
  );
  assert.deepEqual(await readdir(root), []);
});
