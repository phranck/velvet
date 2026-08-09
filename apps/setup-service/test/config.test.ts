import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "bun:test";

import { loadSetupServiceConfig } from "../src/config.js";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2_048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

const environment = {
  NODE_ENV: "production",
  PUBLIC_ORIGIN: "https://setup.velvet.dev",
  GITHUB_APP_ID: "12345",
  GITHUB_APP_SLUG: "velvet-setup",
  GITHUB_APP_CLIENT_ID: "Iv1.client",
  GITHUB_APP_CLIENT_SECRET: "client-secret-value",
  GITHUB_APP_PRIVATE_KEY: privateKey.replaceAll("\n", "\\n"),
  SESSION_SECRET: "s".repeat(32),
  PORT: "3000",
};

test("loads the deployment's origin, key, and port from the environment", () => {
  const config = loadSetupServiceConfig(environment);

  assert.equal(config.publicOrigin, "https://setup.velvet.dev");
  assert.equal(config.github.privateKey.includes("BEGIN PRIVATE KEY"), true);
  assert.equal(config.secureCookies, true);
  assert.equal(config.port, 3_000);
  assert.equal(config.github.appSlug, "velvet-setup");
});

test("ignores analytics settings, because there are none to honour", () => {
  // Velvet observes nobody. An environment carrying these from an older deploy
  // has to be harmless rather than fatal, so they are simply not read.
  const config = loadSetupServiceConfig({
    ...environment,
    ANALYTICS_SCRIPT_URL: "https://analytics.example.com/script.js",
    ANALYTICS_WEBSITE_ID: "11111111-2222-3333-4444-555555555555",
  });
  assert.equal("analytics" in config, false);
});

test("rejects unsafe origins, weak sessions, and invalid private keys", () => {
  assert.throws(
    () => loadSetupServiceConfig({ ...environment, PUBLIC_ORIGIN: "http://setup.velvet.dev" }),
    /HTTPS/,
  );
  assert.throws(
    () => loadSetupServiceConfig({ ...environment, SESSION_SECRET: "short" }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () => loadSetupServiceConfig({ ...environment, GITHUB_APP_PRIVATE_KEY: "not-a-key" }),
    /GITHUB_APP_PRIVATE_KEY/,
  );
});

test("allows explicit localhost HTTP only outside production", () => {
  const config = loadSetupServiceConfig({
    ...environment,
    NODE_ENV: "development",
    PUBLIC_ORIGIN: "http://localhost:3000",
  });
  assert.equal(config.secureCookies, false);
});

test("the serial counter stays off until a repository is named", () => {
  assert.equal(loadSetupServiceConfig(environment).serialCounter, null);
  assert.equal(
    loadSetupServiceConfig({ ...environment, SERIAL_COUNTER_REPOSITORY: "   " })
      .serialCounter,
    null,
    "a blank setting is the same as an absent one",
  );
});

test("the serial counter takes a repository and defaults its path", () => {
  assert.deepEqual(
    loadSetupServiceConfig({
      ...environment,
      SERIAL_COUNTER_REPOSITORY: "phranck/velvet-registry",
    }).serialCounter,
    { repository: "phranck/velvet-registry", path: "registry.json" },
  );
  assert.deepEqual(
    loadSetupServiceConfig({
      ...environment,
      SERIAL_COUNTER_REPOSITORY: "phranck/velvet-registry",
      SERIAL_COUNTER_PATH: "data/counter.json",
    }).serialCounter,
    { repository: "phranck/velvet-registry", path: "data/counter.json" },
  );
});

test("a misconfigured serial counter fails at start-up, not at the first setup", () => {
  for (const repository of ["velvet-registry", "a/b/c", "/name"]) {
    assert.throws(
      () =>
        loadSetupServiceConfig({
          ...environment,
          SERIAL_COUNTER_REPOSITORY: repository,
        }),
      /owner\/name/,
      repository,
    );
  }
  for (const path of ["../escape.json", "counter.yaml", "/absolute.json"]) {
    assert.throws(
      () =>
        loadSetupServiceConfig({
          ...environment,
          SERIAL_COUNTER_REPOSITORY: "phranck/velvet-registry",
          SERIAL_COUNTER_PATH: path,
        }),
      /SERIAL_COUNTER_PATH/,
      path,
    );
  }
});

test("serves no alarm relay unless both of its secrets are set", () => {
  // Absent is a valid deployment, and the route then says so with a code of its
  // own rather than failing in a way somebody would go looking for.
  assert.equal(loadSetupServiceConfig(environment).notify, null);

  // Half of it is not. A token without a signing secret has no way to tell
  // whose recipient it was given, and a secret without a token has nothing to
  // forward to, so starting either way would leave every alarm refused for a
  // reason nobody would think to look for.
  assert.throws(
    () =>
      loadSetupServiceConfig({
        ...environment,
        PUSHOVER_APPLICATION_TOKEN: "a".repeat(30),
      }),
    /must be set together/,
  );
  assert.throws(
    () =>
      loadSetupServiceConfig({
        ...environment,
        NOTIFY_GRANT_SECRET: "g".repeat(32),
      }),
    /must be set together/,
  );
});

test("takes the relay's limits from the environment, with figures of its own", () => {
  const relaying = {
    ...environment,
    PUSHOVER_APPLICATION_TOKEN: "a".repeat(30),
    NOTIFY_GRANT_SECRET: "g".repeat(32),
  };

  // Pushover allows an account 10,000 messages a month, so roughly 333 a day
  // across every installation. Fifty a day lets one outage run without emptying
  // the month, and the floor keeps the rest of it open for everybody else.
  const defaults = loadSetupServiceConfig(relaying);
  assert.equal(defaults.notify?.dailyLimit, 50);
  assert.equal(defaults.notify?.quotaFloor, 500);

  const chosen = loadSetupServiceConfig({
    ...relaying,
    NOTIFY_DAILY_LIMIT: "20",
    NOTIFY_QUOTA_FLOOR: "1000",
  });
  assert.equal(chosen.notify?.dailyLimit, 20);
  assert.equal(chosen.notify?.quotaFloor, 1_000);

  assert.throws(
    () => loadSetupServiceConfig({ ...relaying, NOTIFY_DAILY_LIMIT: "0" }),
    /NOTIFY_DAILY_LIMIT/,
  );
});

test("refuses a Pushover token or grant secret that cannot be right", () => {
  assert.throws(
    () =>
      loadSetupServiceConfig({
        ...environment,
        // Pushover states that application tokens are 30 characters of
        // [A-Za-z0-9], so a shorter one is a paste that lost something.
        PUSHOVER_APPLICATION_TOKEN: "a".repeat(29),
        NOTIFY_GRANT_SECRET: "g".repeat(32),
      }),
    /PUSHOVER_APPLICATION_TOKEN/,
  );
  assert.throws(
    () =>
      loadSetupServiceConfig({
        ...environment,
        PUSHOVER_APPLICATION_TOKEN: "a".repeat(30),
        NOTIFY_GRANT_SECRET: "g".repeat(31),
      }),
    /NOTIFY_GRANT_SECRET/,
  );
});
