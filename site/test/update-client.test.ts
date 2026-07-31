import assert from "node:assert/strict";
import { test } from "bun:test";

import { readAvailableRelease } from "../src/lib/update-client.js";

function respond(body: unknown, status = 200) {
  return async () => new Response(JSON.stringify(body), { status });
}

const valid = {
  availableVersion: "2.0.0",
  releaseType: "feature",
  automaticInstallEligible: false,
  releaseNotes: "# Velvet 2.0.0\n",
};

test("reads a well-formed release", async () => {
  const release = await readAvailableRelease(respond(valid));

  assert.deepEqual(release, valid);
});

test("sends credentials so the session is recognised", async () => {
  let seen: RequestInit | undefined;
  await readAvailableRelease(async (_input, init) => {
    seen = init;
    return new Response(JSON.stringify(valid));
  });

  assert.equal(seen?.credentials, "include");
  assert.equal(seen?.method, "GET");
});

test("shows nothing rather than something wrong", async () => {
  const malformed: unknown[] = [
    { ...valid, availableVersion: "not-a-version" },
    { ...valid, releaseType: "urgent" },
    { ...valid, automaticInstallEligible: "yes" },
    { ...valid, releaseNotes: 42 },
    { availableVersion: "2.0.0" },
    null,
    "release",
  ];

  for (const body of malformed) {
    assert.equal(
      await readAvailableRelease(respond(body)),
      null,
      `${JSON.stringify(body)} must not be shown`,
    );
  }
});

test("stays quiet when the user is not signed in or the service is down", async () => {
  assert.equal(await readAvailableRelease(respond({}, 401)), null);
  assert.equal(await readAvailableRelease(respond({}, 503)), null);
  assert.equal(
    await readAvailableRelease(async () => {
      throw new TypeError("network down");
    }),
    null,
  );
});
