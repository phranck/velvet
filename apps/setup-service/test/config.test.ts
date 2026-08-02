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

test("collects no analytics unless an instance asks for it", () => {
  // The default that matters. Velvet is installed and run by other people, so
  // an instance that configures nothing must report to nobody.
  assert.equal(loadSetupServiceConfig(environment).analytics, null);

  const configured = loadSetupServiceConfig({
    ...environment,
    ANALYTICS_SCRIPT_URL: "https://analytics.example.com/script.js",
    ANALYTICS_WEBSITE_ID: "11111111-2222-3333-4444-555555555555",
  });
  assert.deepEqual(configured.analytics, {
    scriptUrl: "https://analytics.example.com/script.js",
    websiteId: "11111111-2222-3333-4444-555555555555",
  });
});

test("refuses analytics settings that would silently record nothing", () => {
  // Half a configuration is the worst outcome: the page looks instrumented and
  // no data ever arrives, which nobody discovers until they go looking.
  assert.throws(
    () =>
      loadSetupServiceConfig({
        ...environment,
        ANALYTICS_SCRIPT_URL: "https://analytics.example.com/script.js",
      }),
    /together/u,
  );
  assert.throws(
    () =>
      loadSetupServiceConfig({ ...environment, ANALYTICS_WEBSITE_ID: "abc" }),
    /together/u,
  );
  assert.throws(
    () =>
      loadSetupServiceConfig({
        ...environment,
        ANALYTICS_SCRIPT_URL: "http://analytics.example.com/script.js",
        ANALYTICS_WEBSITE_ID: "abc",
      }),
    /HTTPS/u,
  );
  // The identifier is written into an HTML attribute, so anything that could
  // break out of one is refused where it enters rather than escaped later.
  assert.throws(
    () =>
      loadSetupServiceConfig({
        ...environment,
        ANALYTICS_SCRIPT_URL: "https://analytics.example.com/script.js",
        ANALYTICS_WEBSITE_ID: '"><script>alert(1)</script>',
      }),
    /ANALYTICS_WEBSITE_ID/u,
  );
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
