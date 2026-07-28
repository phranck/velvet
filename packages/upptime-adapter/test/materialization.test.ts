import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import {
  convertUpptimeSnapshot,
  materializeVelvetDocuments,
  serializeVelvetDocuments,
} from "../src/index.js";
import { statusLmaaSpaceSnapshot } from "./fixtures/status-lmaa-space.js";

test("materializes one complete Velvet snapshot", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-materialize-"));
  const outputDirectory = join(temporaryDirectory, "velvet-data", "v1");

  try {
    const documents = convertUpptimeSnapshot(statusLmaaSpaceSnapshot, {
      generatedAt: "2026-07-25T23:30:00.000Z",
    });
    const expected = serializeVelvetDocuments(documents);

    await materializeVelvetDocuments(outputDirectory, documents);

    assert.deepEqual(await readdir(outputDirectory), [
      "incidents.json",
      "response-times.json",
      "status.json",
    ]);
    for (const [fileName, contents] of Object.entries(expected)) {
      assert.equal(await readFile(join(outputDirectory, fileName), "utf8"), contents);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("replaces a previous snapshot as one complete document set", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-materialize-"));
  const outputDirectory = join(temporaryDirectory, "velvet-data", "v1");

  try {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, "stale.json"), "stale\n", "utf8");
    const documents = convertUpptimeSnapshot(statusLmaaSpaceSnapshot, {
      generatedAt: "2026-07-25T23:30:00.000Z",
    });

    await materializeVelvetDocuments(outputDirectory, documents);

    assert.deepEqual(await readdir(outputDirectory), [
      "incidents.json",
      "response-times.json",
      "status.json",
    ]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
