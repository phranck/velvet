import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { IncidentsDocument } from "@velvet/contracts";

import {
  createVelvetDataClient,
  refreshIncidentsDocument,
  type VelvetSnapshot,
} from "../src/lib/data-client.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");

async function fixture(path: string): Promise<unknown> {
  return JSON.parse(
    await readFile(resolve(repositoryRoot, "packages/contracts/fixtures/valid", path), "utf8"),
  );
}

test("loads and validates one complete Velvet snapshot", async () => {
  const documents = new Map<string, unknown>([
    ["status.json", await fixture("status/dual-stack.json")],
    ["response-times.json", await fixture("response-times/with-unavailable.json")],
    ["incidents.json", await fixture("incidents/incident.json")],
  ]);
  const requests: string[] = [];
  const fetchImplementation: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push(url);
    const fileName = new URL(url).pathname.split("/").at(-1) ?? "";
    return Response.json(documents.get(fileName));
  };
  const client = createVelvetDataClient(
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1/",
    fetchImplementation,
  );

  const snapshot: VelvetSnapshot = await client.loadSnapshot();

  assert.equal(snapshot.status.services[0]?.id, "website");
  assert.equal(snapshot.responseTimes.series.length, 2);
  assert.equal(snapshot.incidents.events[0]?.id, "incident-2026-07-27");
  assert.deepEqual(requests.sort(), [
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1/incidents.json",
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1/response-times.json",
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1/status.json",
  ]);
});

test("rejects unsupported schema versions with a safe error", async () => {
  const status = (await fixture("status/dual-stack.json")) as Record<
    string,
    unknown
  >;
  status.schemaVersion = 2;
  const client = createVelvetDataClient(
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1",
    async () => Response.json(status),
  );

  await assert.rejects(
    client.loadStatus(),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "UNSUPPORTED_SCHEMA_VERSION" &&
      error.message === "This Velvet data schema version is not supported.",
  );
});

test("retains the last valid incidents document when refresh validation fails", async () => {
  const current = (await fixture("incidents/incident.json")) as IncidentsDocument;
  const client = createVelvetDataClient(
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1",
    async () => Response.json({ schemaVersion: 1, generatedAt: "invalid" }),
  );

  const refreshed = await refreshIncidentsDocument(client, () => current);

  assert.equal(refreshed, current);
});

test("does not let a slower incident refresh replace newer valid state", async () => {
  const older = (await fixture("incidents/incident.json")) as IncidentsDocument;
  const newer: IncidentsDocument = {
    ...older,
    generatedAt: "2026-07-27T12:01:00.000Z",
  };
  let current = older;
  let resolveRefresh!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    resolveRefresh = resolve;
  });
  const client = createVelvetDataClient(
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1",
    async () => response,
  );

  const refresh = refreshIncidentsDocument(client, () => current);
  current = newer;
  resolveRefresh(Response.json(older));

  assert.equal(await refresh, newer);
});
