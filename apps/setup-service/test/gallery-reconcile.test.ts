import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "bun:test";

import { createAutomaticUpdateRunner } from "../src/update-automatic.js";

const privateKeyPem = generateKeyPairSync("rsa", { modulusLength: 2_048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

/** A configuration as an installation's own `velvet.yml` would hold it. */
function configuration(listed: boolean | null): string {
  return [
    "schemaVersion: 1",
    "repository:",
    "  owner: example",
    "  name: status",
    "statusPage:",
    "  name: Example",
    "  theme: velvet",
    ...(listed === null ? [] : ["gallery:", `  listed: ${listed}`]),
    "services:",
    "  - name: Website",
    "    url: https://example.com",
  ].join("\n");
}

/**
 * Runs one reconciliation against a stubbed GitHub and a recording registry.
 *
 * @param velvetYml - What the installation's configuration says, or `null` for
 *   a repository that has no `velvet.yml` at all.
 */
function harness(
  velvetYml: string | null,
  options: {
    listedRepositories?: string[];
    covered?: boolean;
    readable?: boolean;
    /** Records the counter holds, with whatever absence note each carries. */
    records?: { repository: string; unreachableSince?: string }[];
  } = {},
) {
  const written: { repository: string; listed: boolean }[] = [];
  const records = options.records ?? [];
  const forgotten: string[] = [];
  const covered = options.covered ?? true;
  const readable = options.readable ?? true;
  const runner = createAutomaticUpdateRunner({
    app: {
      appId: "12345",
      privateKey: privateKeyPem,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/app/installations") return Response.json([{ id: 7 }]);
        if (path.endsWith("/access_tokens")) {
          return Response.json({ token: "installation-token" });
        }
        if (path === "/installation/repositories") {
          // An app removed from a repository, or a repository deleted, simply
          // stops appearing here. Nothing announces it.
          return Response.json({
            total_count: covered ? 1 : 0,
            repositories: covered
              ? [{ id: 9, name: "status", owner: { login: "example" } }]
              : [],
          });
        }
        if (path.endsWith("/contents/velvet.yml")) {
          if (!readable) return new Response("{}", { status: 500 });
          if (velvetYml === null) return new Response("{}", { status: 404 });
          return Response.json({
            type: "file",
            encoding: "base64",
            content: Buffer.from(velvetYml, "utf8").toString("base64"),
          });
        }
        return new Response("{}", { status: 404 });
      },
    },
    releases: {
      latest: () => "2.0.0",
      get: async () => {
        throw new Error("a gallery pass reads no release");
      },
    },
    orchestrator: {
      async reconcile() {
        throw new Error("a gallery pass installs nothing");
      },
    },
    serials: {
      peek: async () => 1,
      claim: async () => 1,
      listed: async () => [],
      listedRepositories: async () => options.listedRepositories ?? [],
      recordedRepositories: async () => records.map((record) => record.repository),
      async setUnreachable(repository, since) {
        const record = records.find((entry) => entry.repository === repository);
        if (!record) return false;
        // The first miss is what the period is measured from, so a note that
        // exists is left where it is.
        const noted = record.unreachableSince !== undefined;
        if (since === null ? !noted : noted) return false;
        if (since === null) delete record.unreachableSince;
        else record.unreachableSince = since;
        return true;
      },
      async forgetUnreachableSince(before) {
        const gone = records.filter(
          (record) =>
            record.unreachableSince !== undefined && record.unreachableSince < before,
        );
        for (const record of gone) {
          records.splice(records.indexOf(record), 1);
          forgotten.push(record.repository);
        }
        return gone.map((record) => record.repository);
      },
      async setListed(repository, listed) {
        written.push({ repository, listed });
        return true;
      },
    },
  });
  return { runner, written, records, forgotten };
}

test("lists an installation whose own configuration says so", async () => {
  const { runner, written } = harness(configuration(true));

  const result = await runner.reconcileGallery();

  assert.deepEqual(written, [{ repository: "example/status", listed: true }]);
  assert.equal(result.installations, 1);
  assert.equal(result.repositories, 1);
  assert.equal(result.failures, 0);
});

test("unlists one that says no, and one that has stopped saying anything", async () => {
  // Withdrawal is the case that matters. Somebody who unticks the box, or who
  // removes the section entirely, has to leave the gallery on the next pass.
  for (const source of [configuration(false), configuration(null)]) {
    const { runner, written } = harness(source);

    await runner.reconcileGallery();

    assert.deepEqual(written, [{ repository: "example/status", listed: false }]);
  }
});

test("treats a repository with no configuration as no consent", async () => {
  const { runner, written } = harness(null);

  const result = await runner.reconcileGallery();

  // Appearing publicly is opted into, never inferred, so anything short of an
  // explicit yes is a no.
  assert.deepEqual(written, [{ repository: "example/status", listed: false }]);
  assert.equal(result.failures, 0);
});

test("reads no release and installs nothing", async () => {
  // The release provider and the orchestrator both throw if touched. A gallery
  // pass has to run whether or not a release is pending, which is exactly why
  // it is not hung off the security sweep.
  const { runner } = harness(configuration(true));

  await runner.reconcileGallery();
});

test("does nothing at all without a registry", async () => {
  const runner = createAutomaticUpdateRunner({
    app: {
      appId: "12345",
      privateKey: privateKeyPem,
      fetch: async () => {
        throw new Error("an instance with no registry asks GitHub nothing");
      },
    },
    releases: {
      latest: () => "2.0.0",
      get: async () => {
        throw new Error("unused");
      },
    },
    orchestrator: {
      async reconcile() {
        throw new Error("unused");
      },
    },
  });

  const result = await runner.reconcileGallery();

  assert.deepEqual(result, {
    installations: 0,
    repositories: 0,
    changed: 0,
    unreachable: 0,
    forgotten: 0,
    failures: 0,
    truncated: false,
  });
});

test("unlists an installation the pass can no longer reach", async () => {
  // A deleted repository, or one the app was removed from, is absent from the
  // app's list rather than announced. Walking that list alone therefore never
  // revisits it, and it would stay listed for good.
  const { runner, written } = harness(null, {
    covered: false,
    listedRepositories: ["example/status"],
  });

  const result = await runner.reconcileGallery();

  assert.deepEqual(written, [{ repository: "example/status", listed: false }]);
  assert.equal(result.unreachable, 1);
  assert.equal(result.repositories, 0);
});

test("leaves an entry alone when the pass reached it", async () => {
  const { runner, written } = harness(configuration(true), {
    listedRepositories: ["example/status"],
  });

  const result = await runner.reconcileGallery();

  // Reached and consenting, so the only write is the one that says so.
  assert.deepEqual(written, [{ repository: "example/status", listed: true }]);
  assert.equal(result.unreachable, 0);
});

test("unlists nothing from a pass that could not read a repository", async () => {
  // Absence from an incomplete list is no evidence at all. A bad afternoon at
  // GitHub would otherwise empty the gallery.
  const { runner, written } = harness(null, {
    readable: false,
    listedRepositories: ["example/other"],
  });

  const result = await runner.reconcileGallery();

  assert.equal(result.failures, 1);
  assert.equal(result.unreachable, 0);
  assert.deepEqual(written, []);
});

test("notes when an installation first went out of reach, and only then", async () => {
  const records: { repository: string; unreachableSince?: string }[] = [
    { repository: "example/status" },
  ];
  const { runner } = harness(null, { covered: false, records });

  await runner.reconcileGallery();
  const first = records[0]?.unreachableSince;
  assert.ok(first, "the first miss is noted");

  // A second pass must leave it where it is. Rewriting it would push the moment
  // forward for as long as the installation stays gone, and the grace period
  // would never elapse.
  await runner.reconcileGallery();
  assert.equal(records[0]?.unreachableSince, first);
});

test("clears the note as soon as the installation is seen again", async () => {
  const records = [
    { repository: "example/status", unreachableSince: "2026-07-01T00:00:00.000Z" },
  ];
  const { runner } = harness(configuration(true), { records });

  await runner.reconcileGallery();

  assert.equal(records[0]?.unreachableSince, undefined);
});

test("forgets a record once it has been out of reach for the grace period", async () => {
  // Thirty-one days, so it is past the period rather than at its edge.
  const long = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000).toISOString();
  const records = [
    { repository: "example/status", unreachableSince: long },
    { repository: "example/recent", unreachableSince: new Date().toISOString() },
  ];
  const { runner, forgotten } = harness(null, { covered: false, records });

  const result = await runner.reconcileGallery();

  assert.deepEqual(forgotten, ["example/status"]);
  assert.equal(result.forgotten, 1);
  // The one that went out of reach recently stays, because a repository gone
  // for an afternoon and one gone for good look identical from here.
  assert.deepEqual(
    records.map((record) => record.repository),
    ["example/recent"],
  );
});

test("forgets nothing from a pass that could not see everything", async () => {
  const long = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000).toISOString();
  const records = [{ repository: "example/other", unreachableSince: long }];
  const { runner, forgotten } = harness(null, { readable: false, records });

  const result = await runner.reconcileGallery();

  assert.equal(result.failures, 1);
  assert.equal(result.forgotten, 0);
  assert.deepEqual(forgotten, []);
});
