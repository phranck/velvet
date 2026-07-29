import assert from "node:assert/strict";
import { test } from "bun:test";

import * as adapter from "../src/index.js";
import type {
  GitHubUpptimeMigrationSourceOptions,
  LoadedUpptimeMigrationSnapshot,
  UpptimeMigrationResult,
  UpptimeSnapshot,
  VumDependencies,
} from "../src/index.js";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

type RunVum = (
  args: string[],
  environment: Record<string, string | undefined>,
  dependencies: VumDependencies,
) => Promise<void>;

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
    commits: { website: [] },
    issues: [],
  };
}

function migrationSource(): LoadedUpptimeMigrationSnapshot {
  return {
    source: {
      repository: "example/status",
      ref: "main",
      commit: SOURCE_COMMIT,
      committedAt: "2026-07-29T12:00:00.000Z",
    },
    snapshot: snapshot(),
  };
}

async function run(
  args: string[],
  options: { json?: boolean; write?: boolean } = {},
): Promise<{
  output: string[];
  loadOptions: GitHubUpptimeMigrationSourceOptions[];
  destinations: string[];
}> {
  const candidate = Reflect.get(adapter, "runVum");
  if (typeof candidate !== "function") {
    assert.fail("@velvet/upptime-adapter must export runVum");
  }
  const output: string[] = [];
  const loadOptions: GitHubUpptimeMigrationSourceOptions[] = [];
  const destinations: string[] = [];
  const create = Reflect.get(adapter, "createUpptimeMigration");
  assert.equal(typeof create, "function");
  const createMigration = create as (
    snapshot: UpptimeSnapshot,
    source: LoadedUpptimeMigrationSnapshot["source"],
  ) => UpptimeMigrationResult;
  await (candidate as unknown as RunVum)(
    args,
    {
      GITHUB_TOKEN: "do-not-print",
      GITHUB_API_URL: "https://api.github.test",
    },
    {
      load: async (loadInput) => {
        loadOptions.push(loadInput);
        return migrationSource();
      },
      create: createMigration,
      materialize: async (destination) => {
        destinations.push(destination);
      },
      write: (value) => output.push(value),
    },
  );
  if (options.json) assert.doesNotThrow(() => JSON.parse(output.join("")));
  if (options.write) assert.equal(destinations.length, 1);
  return { output, loadOptions, destinations };
}

test("runs as a human-readable dry run by default", async () => {
  const result = await run(["--repository", "example/status"]);

  assert.equal(result.destinations.length, 0);
  assert.match(result.output.join(""), /# Velvet Upptime migration/u);
  assert.deepEqual(result.loadOptions, [
    {
      repository: "example/status",
      token: "do-not-print",
      apiBaseUrl: "https://api.github.test",
    },
  ]);
  assert.equal(result.output.join("").includes("do-not-print"), false);
});

test("prints the machine report as JSON when requested", async () => {
  const result = await run(
    ["--repository", "example/status", "--ref", "source-ref", "--json"],
    { json: true },
  );
  const report = JSON.parse(result.output.join("")) as {
    source: { commit: string };
  };

  assert.equal(report.source.commit, SOURCE_COMMIT);
  assert.equal(result.loadOptions[0]?.ref, "source-ref");
});

test("writes only with an explicit destination", async () => {
  const result = await run(
    [
      "--repository",
      "example/status",
      "--write",
      "--destination",
      "./migration-output",
    ],
    { write: true },
  );

  assert.deepEqual(result.destinations, ["./migration-output"]);
});

test("rejects write mode without a destination and never supports force", async () => {
  const candidate = Reflect.get(adapter, "runVum");
  if (typeof candidate !== "function") {
    assert.fail("@velvet/upptime-adapter must export runVum");
  }
  const dependencies: VumDependencies = {
    load: async () => migrationSource(),
    create: () => {
      throw new Error("must not create");
    },
    materialize: async () => undefined,
    write: () => undefined,
  };

  for (const args of [
    ["--repository", "example/status", "--write"],
    ["--repository", "example/status", "--force"],
  ]) {
    await assert.rejects(
      (candidate as unknown as RunVum)(args, {}, dependencies),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "INVALID_INPUT",
    );
  }
});
