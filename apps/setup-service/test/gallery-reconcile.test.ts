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
function harness(velvetYml: string | null) {
  const written: { repository: string; listed: boolean }[] = [];
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
          return Response.json({
            total_count: 1,
            repositories: [
              { id: 9, name: "status", owner: { login: "example" } },
            ],
          });
        }
        if (path.endsWith("/contents/velvet.yml")) {
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
      async setListed(repository, listed) {
        written.push({ repository, listed });
        return true;
      },
    },
  });
  return { runner, written };
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
    failures: 0,
    truncated: false,
  });
});
