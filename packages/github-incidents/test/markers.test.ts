import assert from "node:assert/strict";
import { test } from "bun:test";

type IncidentMetadata = {
  schemaVersion: 1;
  kind: "incident";
  serviceId: string;
  checkId: string;
  transitionAt: string;
  startedAt: string;
};

type MaintenanceMetadata = {
  schemaVersion: 1;
  kind: "maintenance";
  targets: Array<{ serviceId: string; checkId: string | null }>;
  startsAt: string;
  endsAt: string;
  summary: string;
};

const markerModule = import("../src/index.js").catch(() => ({}));

async function markerFunctions(): Promise<{
  serializeVelvetMetadata: (
    metadata: IncidentMetadata | MaintenanceMetadata,
  ) => string;
  parseVelvetMetadata: (
    source: string,
  ) => IncidentMetadata | MaintenanceMetadata | null;
  upsertVelvetMetadata: (
    body: string,
    metadata: IncidentMetadata | MaintenanceMetadata,
  ) => string;
  serializeActionMarker: (actionId: string) => string;
  hasActionMarker: (body: string, actionId: string) => boolean;
}> {
  const module = (await markerModule) as Record<string, unknown>;
  for (const name of [
    "serializeVelvetMetadata",
    "parseVelvetMetadata",
    "upsertVelvetMetadata",
    "serializeActionMarker",
    "hasActionMarker",
  ]) {
    if (typeof module[name] !== "function") {
      assert.fail(`@velvet/github-incidents must export ${name}`);
    }
  }
  return module as Awaited<ReturnType<typeof markerFunctions>>;
}

test("round-trips strict incident metadata in a hidden marker", async () => {
  const { parseVelvetMetadata, serializeVelvetMetadata } =
    await markerFunctions();
  const metadata: IncidentMetadata = {
    schemaVersion: 1,
    kind: "incident",
    serviceId: "website",
    checkId: "homepage",
    transitionAt: "2026-07-29T12:01:00.000Z",
    startedAt: "2026-07-29T12:01:00.000Z",
  };

  const marker = serializeVelvetMetadata(metadata);

  assert.match(marker, /^<!-- velvet-metadata:/);
  assert.deepEqual(parseVelvetMetadata(marker), metadata);
});

test("round-trips exact maintenance targets without duplicate coverage", async () => {
  const { parseVelvetMetadata, serializeVelvetMetadata } =
    await markerFunctions();
  const metadata: MaintenanceMetadata = {
    schemaVersion: 1,
    kind: "maintenance",
    targets: [
      { serviceId: "api", checkId: "readiness" },
      { serviceId: "website", checkId: null },
    ],
    startsAt: "2026-08-01T20:00:00.000Z",
    endsAt: "2026-08-01T21:00:00.000Z",
    summary: "Database and application updates.",
  };

  assert.deepEqual(
    parseVelvetMetadata(serializeVelvetMetadata(metadata)),
    metadata,
  );
});

test("rejects malformed, duplicated, and foreign metadata", async () => {
  const { parseVelvetMetadata } = await markerFunctions();
  const valid =
    '<!-- velvet-metadata:{"schemaVersion":1,"kind":"incident","serviceId":"website","checkId":"homepage","transitionAt":"2026-07-29T12:01:00.000Z","startedAt":"2026-07-29T12:01:00.000Z"} -->';

  assert.equal(parseVelvetMetadata("ordinary issue body"), null);
  assert.equal(
    parseVelvetMetadata(
      '<!-- velvet-metadata:{"schemaVersion":1,"kind":"incident","serviceId":"Bad ID","checkId":"homepage","transitionAt":"2026-07-29T12:01:00.000Z","startedAt":"2026-07-29T12:01:00.000Z"} -->',
    ),
    null,
  );
  assert.equal(parseVelvetMetadata(`${valid}\n${valid}`), null);
  assert.equal(
    parseVelvetMetadata(
      '<!-- velvet-metadata:{"schemaVersion":1,"kind":"incident","serviceId":"website","checkId":"homepage","transitionAt":"2026-07-29T12:01:00.000Z","startedAt":"2026-07-29T12:01:00.000Z","token":"secret"} -->',
    ),
    null,
  );
});

test("replaces one existing marker without changing the human body", async () => {
  const { parseVelvetMetadata, upsertVelvetMetadata } =
    await markerFunctions();
  const previous: MaintenanceMetadata = {
    schemaVersion: 1,
    kind: "maintenance",
    targets: [{ serviceId: "website", checkId: null }],
    startsAt: "2026-08-01T20:00:00.000Z",
    endsAt: "2026-08-01T21:00:00.000Z",
    summary: "Database upgrade.",
  };
  const next = {
    ...previous,
    endsAt: "2026-08-01T22:00:00.000Z",
  };
  const initialBody = `Planned database upgrade\n\n${(
    await markerFunctions()
  ).serializeVelvetMetadata(previous)}`;

  const updatedBody = upsertVelvetMetadata(initialBody, next);

  assert.match(updatedBody, /^Planned database upgrade/);
  assert.equal(updatedBody.match(/velvet-metadata:/g)?.length, 1);
  assert.deepEqual(parseVelvetMetadata(updatedBody), next);
});

test("uses hidden action markers to recognize completed effects", async () => {
  const { hasActionMarker, serializeActionMarker } = await markerFunctions();
  const marker = serializeActionMarker(
    "incident:website:homepage:2026-07-29t12-01-00-000z:resolved",
  );

  assert.equal(hasActionMarker(`Recovered.\n\n${marker}`, "incident:website:homepage:2026-07-29t12-01-00-000z:resolved"), true);
  assert.equal(hasActionMarker(marker, "different-action"), false);
  assert.throws(() => serializeActionMarker("invalid action with spaces"));
});
