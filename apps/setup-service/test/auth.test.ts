import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";

import {
  createGitHubAuthorizationUrl,
  createGitHubBootstrapInstallationUrl,
  createGitHubInstallationUrl,
  createPkceAuthorization,
} from "../src/auth.js";

test("builds a PKCE S256 authorization without putting a secret in the URL", () => {
  const codeVerifier = "v".repeat(43);
  const authorization = createPkceAuthorization(() => codeVerifier);
  const expectedChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  assert.deepEqual(authorization, {
    state: codeVerifier,
    codeVerifier,
    codeChallenge: expectedChallenge,
  });

  const url = new URL(
    createGitHubAuthorizationUrl({
      clientId: "Iv1.client",
      state: authorization.state,
      codeChallenge: authorization.codeChallenge,
    }),
  );
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/login/oauth/authorize");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("client_secret"), null);
});

test("builds an allowlisted GitHub App installation URL for one repository", () => {
  const url = new URL(
    createGitHubInstallationUrl(
      "velvet-setup",
      "s".repeat(43),
      255_022_500,
      123_456_789,
    ),
  );
  assert.equal(
    url.pathname,
    "/apps/velvet-setup/installations/new/permissions",
  );
  assert.equal(url.searchParams.get("state"), "s".repeat(43));
  assert.equal(url.searchParams.get("suggested_target_id"), "255022500");
  assert.deepEqual(url.searchParams.getAll("repository_ids[]"), ["123456789"]);
  assert.throws(
    () =>
      createGitHubInstallationUrl(
        "../attacker",
        "s".repeat(43),
        255_022_500,
        123_456_789,
      ),
    /slug/i,
  );
  assert.throws(
    () =>
      createGitHubInstallationUrl(
        "velvet-setup",
        "s".repeat(43),
        0,
        123_456_789,
      ),
    /target/i,
  );
});

test("builds an explicit temporary account installation URL without a repository", () => {
  const url = new URL(
    createGitHubBootstrapInstallationUrl(
      "velvet-setup",
      "s".repeat(43),
      255_022_500,
    ),
  );

  assert.equal(
    url.pathname,
    "/apps/velvet-setup/installations/new/permissions",
  );
  assert.equal(url.searchParams.get("state"), "s".repeat(43));
  assert.equal(url.searchParams.get("suggested_target_id"), "255022500");
  assert.deepEqual(url.searchParams.getAll("repository_ids[]"), []);
});
