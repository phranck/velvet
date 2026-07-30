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

test("loads deployment secrets without exposing them through public config", () => {
  const config = loadSetupServiceConfig(environment);

  assert.equal(config.publicOrigin, "https://setup.velvet.dev");
  assert.equal(config.github.privateKey.includes("BEGIN PRIVATE KEY"), true);
  assert.equal(config.secureCookies, true);
  assert.equal(config.port, 3_000);
  assert.deepEqual(config.public, {
    publicOrigin: "https://setup.velvet.dev",
    githubAppSlug: "velvet-setup",
  });
  assert.doesNotMatch(JSON.stringify(config.public), /client-secret|PRIVATE KEY|ssss/);
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
