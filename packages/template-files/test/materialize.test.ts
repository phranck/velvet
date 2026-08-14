import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";
import { load } from "js-yaml";

import {
  parseVelvetConfiguration,
  validateVelvetVersionLock,
  type NormalizedVelvetConfiguration,
  type VelvetManagedFile,
  type VelvetReleaseManifest,
} from "@velvet/contracts";

import {
  materializeManagedTemplateFiles,
  type ManagedTemplateFilesResult,
} from "../src/index.js";

const templateCommit = "a".repeat(40);

const configurationResult = parseVelvetConfiguration(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status, theme: velvet }
services:
  - { name: Website, url: https://example.com }
  - name: Public API
    checks:
      - name: Readiness
        url: https://api.example.com/ready
        headers:
          - { name: X-Second, secret: Z_HEALTH_TOKEN }
          - { name: Authorization, secret: API_HEALTH_TOKEN }
      - name: Version
        url: https://api.example.com/version
        headers:
          - { name: Authorization, secret: API_HEALTH_TOKEN }
`);
assert.equal(configurationResult.success, true);
const configuration = configurationResult.success
  ? configurationResult.data
  : (null as never as NormalizedVelvetConfiguration);

const sources = {
  ".github/ISSUE_TEMPLATE/config.yml": `blank_issues_enabled: false\n`,
  ".github/ISSUE_TEMPLATE/maintenance.yml": `
name: Planned maintenance
body:
  - type: dropdown
    id: affected-targets
    attributes:
      label: Affected services and checks
      options:
        - Placeholder
`,
  ".github/workflows/maintenance-switch.yml": `
name: Maintenance switch
on:
  workflow_dispatch:
    inputs:
      services:
        description: Service IDs
        required: true
        default: placeholder
jobs: {}
`,
  ".github/workflows/velvet-response-times.yml": monitorWorkflow("response"),
  ".github/workflows/velvet-status.yml": monitorWorkflow("status"),
  ".github/workflows/velvet.yml": monitorWorkflow("status"),
} as const;

function monitorWorkflow(mode: "response" | "status"): string {
  return `
name: Velvet ${mode}
on: { workflow_dispatch: {} }
jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Publish Velvet ${mode}
        uses: phranck/velvet/actions/monitor@${templateCommit}
        with:
          mode: ${mode}
`;
}

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function replaceFile(path: keyof typeof sources): VelvetManagedFile {
  return {
    path,
    strategy: "replace",
    sourcePath: path,
    sha256: hash(sources[path]),
  };
}

function generatedFile(
  path: Exclude<keyof typeof sources, ".github/ISSUE_TEMPLATE/config.yml">,
  generator:
    | "maintenance-issue-template-v1"
    | "maintenance-workflow-v1"
    | "pages-workflow-v1"
    | "response-times-workflow-v1"
    | "status-workflow-v1",
): VelvetManagedFile {
  return {
    path,
    strategy: "generate",
    generator,
    sourcePath: path,
    sha256: hash(sources[path]),
  } as VelvetManagedFile;
}

function manifest(files: VelvetManagedFile[]): VelvetReleaseManifest {
  return {
    schemaVersion: 1,
    version: "2.0.0",
    releaseType: "feature",
    automaticInstallEligible: false,
    template: {
      repository: "phranck/velvet",
      commit: templateCommit,
    },
    compatibility: {
      minimumInstalledVersion: "2.0.0",
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    managedFiles: [
      ...files,
      {
        path: "velvet.lock.json",
        strategy: "generate",
        generator: "version-lock-v1",
      },
    ],
    releaseNotes: "# Velvet 2.0.0\n",
  };
}

function materialize(
  files: VelvetManagedFile[],
  availableSources: Record<string, string> = sources,
  serial?: number,
): ManagedTemplateFilesResult {
  return materializeManagedTemplateFiles({
    manifest: manifest(files),
    configuration,
    sources: availableSources,
    ...(serial === undefined ? {} : { serial }),
  });
}

function output(result: ManagedTemplateFilesResult, path: string): string {
  assert.equal(result.success, true);
  if (!result.success) return "";
  const file = result.data.files.find((entry) => entry.path === path);
  assert.ok(file, `missing materialized file ${path}`);
  assert.equal(file.sha256, hash(file.content));
  return file.content;
}

function document(source: string): Record<string, unknown> {
  const value = load(source);
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

test("copies verified static template files byte for byte", () => {
  const result = materialize([
    replaceFile(".github/ISSUE_TEMPLATE/config.yml"),
  ]);

  assert.equal(
    output(result, ".github/ISSUE_TEMPLATE/config.yml"),
    sources[".github/ISSUE_TEMPLATE/config.yml"],
  );
});

test("generates deterministic maintenance choices from protected configuration", () => {
  const result = materialize([
    generatedFile(
      ".github/ISSUE_TEMPLATE/maintenance.yml",
      "maintenance-issue-template-v1",
    ),
  ]);
  const form = document(
    output(result, ".github/ISSUE_TEMPLATE/maintenance.yml"),
  );
  const body = form.body as Array<Record<string, unknown>>;
  const dropdown = body.find((entry) => entry.id === "affected-targets");
  assert.deepEqual(
    (dropdown?.attributes as Record<string, unknown>)?.options,
    [
      "Website (all checks) [website/*]",
      "Website / Website [website/website]",
      "Public API (all checks) [public-api/*]",
      "Public API / Readiness [public-api/readiness]",
      "Public API / Version [public-api/version]",
    ],
  );
});

test("sets the maintenance workflow default to the first service", () => {
  const result = materialize([
    generatedFile(
      ".github/workflows/maintenance-switch.yml",
      "maintenance-workflow-v1",
    ),
  ]);
  const workflow = document(
    output(result, ".github/workflows/maintenance-switch.yml"),
  );
  const on = workflow.on as Record<string, unknown>;
  const dispatch = on.workflow_dispatch as Record<string, unknown>;
  const inputs = dispatch.inputs as Record<string, unknown>;
  const services = inputs.services as Record<string, unknown>;
  assert.equal(services.default, "website");
});

test("maps only unique sorted secret names into every monitor workflow", () => {
  for (const [path, generator] of [
    [".github/workflows/velvet-status.yml", "status-workflow-v1"],
    [
      ".github/workflows/velvet-response-times.yml",
      "response-times-workflow-v1",
    ],
    [".github/workflows/velvet.yml", "pages-workflow-v1"],
  ] as const) {
    const result = materialize([generatedFile(path, generator)]);
    const workflow = document(output(result, path));
    const jobs = workflow.jobs as Record<string, unknown>;
    const monitor = jobs.monitor as Record<string, unknown>;
    const steps = monitor.steps as Array<Record<string, unknown>>;
    const action = steps.find(
      (step) =>
        typeof step.uses === "string" &&
        step.uses.startsWith("phranck/velvet/actions/monitor@"),
    );
    assert.deepEqual(action?.env, {
      API_HEALTH_TOKEN: "${{ secrets.API_HEALTH_TOKEN }}",
      Z_HEALTH_TOKEN: "${{ secrets.Z_HEALTH_TOKEN }}",
    });
  }
});

test("generates a stable installed-version lock from the release", () => {
  const first = materialize([]);
  const second = materialize([]);
  const expected = `${JSON.stringify(
    {
      schemaVersion: 1,
      installedVersion: "2.0.0",
      template: {
        repository: "phranck/velvet",
        commit: templateCommit,
      },
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
    },
    null,
    2,
  )}\n`;

  assert.equal(output(first, "velvet.lock.json"), expected);
  assert.equal(output(second, "velvet.lock.json"), expected);
});

test("writes the serial into the lock, and omits it when there is none", () => {
  const withSerial = JSON.parse(output(materialize([], sources, 412), "velvet.lock.json"));
  assert.equal(withSerial.serial, 412);

  // Absent rather than null, because every installation made before serials
  // existed has a lock without the field, and the status page distinguishes
  // "no number" from "number zero" by the field simply not being there.
  const withoutSerial = JSON.parse(output(materialize([]), "velvet.lock.json"));
  assert.equal("serial" in withoutSerial, false);
});

test("keeps a serialised lock valid against the contract", () => {
  const lock = JSON.parse(output(materialize([], sources, 1), "velvet.lock.json"));
  const validation = validateVelvetVersionLock(lock);
  assert.equal(validation.success, true);
  if (!validation.success) return;
  assert.equal(validation.data.serial, 1);
});

test("rejects a missing or changed source before returning any files", () => {
  const entry = replaceFile(".github/ISSUE_TEMPLATE/config.yml");
  for (const availableSources of [
    {},
    { ".github/ISSUE_TEMPLATE/config.yml": "changed\n" },
  ]) {
    const result = materialize([entry], availableSources);
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(
      ["MISSING_TEMPLATE_SOURCE", "TEMPLATE_SOURCE_HASH_MISMATCH"].includes(
        result.errors[0]?.code ?? "",
      ),
      true,
    );
    assert.equal("data" in result, false);
    assert.equal(JSON.stringify(result).includes("changed"), false);
  }
});

test("rejects structurally invalid generator sources with a safe error", () => {
  const path = ".github/ISSUE_TEMPLATE/maintenance.yml";
  const invalidSource = "body: not-an-array\n";
  const file = {
    path,
    strategy: "generate",
    generator: "maintenance-issue-template-v1",
    sourcePath: path,
    sha256: hash(invalidSource),
  } as VelvetManagedFile;
  const result = materialize([file], { [path]: invalidSource });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, "INVALID_TEMPLATE_SOURCE");
  assert.equal(result.errors[0]?.path, path);
  assert.equal(JSON.stringify(result).includes(invalidSource), false);
});
