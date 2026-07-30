import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";

import {
  createGitHubAuthorizationUrl,
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

test("builds an allowlisted GitHub App installation URL with state", () => {
  assert.equal(
    createGitHubInstallationUrl("velvet-setup", "s".repeat(43)),
    `https://github.com/apps/velvet-setup/installations/new?state=${"s".repeat(43)}`,
  );
  assert.throws(
    () => createGitHubInstallationUrl("../attacker", "s".repeat(43)),
    /slug/i,
  );
});
