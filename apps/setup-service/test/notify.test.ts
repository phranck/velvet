import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { test } from "bun:test";

import { createNotifyRelay, PUSHOVER_MESSAGES_URL } from "../src/notify.js";
import { createNotificationGrants } from "../src/notify-grant.js";
import { createGitHubOidcVerifier, GITHUB_OIDC_ISSUER } from "../src/oidc.js";
import { createRateLimiter } from "../src/rate-limit.js";

/**
 * Everything here signs and verifies for real.
 *
 * The identity proof is a genuine RS256 JWT checked against a genuine key set,
 * because the whole point of this route is that a forged proof does not work,
 * and a verifier replaced by a stub would prove nothing about that.
 */

const AUDIENCE = "https://setup.velvet.li";
const KEY_ID = "velvet-test-key";
const OWN_REPOSITORY_ID = 4_711;
const OTHER_REPOSITORY_ID = 9_001;
const USER_KEY = "u".repeat(30);
const GRANT_SECRET = "g".repeat(32);
const APPLICATION_TOKEN = "a".repeat(30);

const signingPair = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const foreignPair = generateKeyPairSync("rsa", { modulusLength: 2_048 });

/** The key set the issuer publishes, holding only the genuine public key. */
const keySet = {
  keys: [
    {
      ...(signingPair.publicKey.export({ format: "jwk" }) as Record<string, unknown>),
      kid: KEY_ID,
      alg: "RS256",
      use: "sig",
    },
  ],
};

/**
 * Mints an identity proof the way GitHub does.
 *
 * @param claims - Anything to override, which is how the refusal cases are built.
 * @param key - Which private key signs it, so a forgery can be signed with another.
 */
function identityToken(
  claims: Record<string, unknown> = {},
  key: KeyObject = signingPair.privateKey,
): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "RS256", typ: "JWT", kid: KEY_ID });
  const payload = encode({
    iss: GITHUB_OIDC_ISSUER,
    aud: AUDIENCE,
    iat: now - 10,
    nbf: now - 10,
    exp: now + 300,
    repository: "example/status",
    repository_owner: "example",
    repository_id: String(OWN_REPOSITORY_ID),
    ...claims,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(key, "base64url")}`;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** What Pushover answered, and what the relay was asked to send. */
interface PushoverExchange {
  status: number;
  body: unknown;
  remaining?: number;
}

/**
 * Builds a relay whose only outside contact is this function's own answers.
 *
 * @param pushover - What Pushover should answer, in order of the calls made.
 * @param overrides - Limits to change for one test.
 */
function relayUnderTest(
  pushover: PushoverExchange[] = [{ status: 200, body: { status: 1 }, remaining: 9_000 }],
  overrides: { dailyLimit?: number; quotaFloor?: number } = {},
) {
  const sent: URLSearchParams[] = [];
  let call = 0;

  const fetchImplementation = async (request: Request): Promise<Response> => {
    const url = request.url;
    if (url === `${GITHUB_OIDC_ISSUER}/.well-known/openid-configuration`) {
      return Response.json({ jwks_uri: `${GITHUB_OIDC_ISSUER}/.well-known/jwks` });
    }
    if (url === `${GITHUB_OIDC_ISSUER}/.well-known/jwks`) {
      return Response.json(keySet);
    }
    if (url === PUSHOVER_MESSAGES_URL) {
      sent.push(new URLSearchParams(await request.text()));
      const answer = pushover[Math.min(call, pushover.length - 1)]!;
      call += 1;
      return Response.json(answer.body, {
        status: answer.status,
        headers:
          answer.remaining === undefined
            ? {}
            : { "X-Limit-App-Remaining": String(answer.remaining) },
      });
    }
    throw new Error(`Unexpected request to ${url}`);
  };

  const grants = createNotificationGrants({ secret: GRANT_SECRET });
  const relay = createNotifyRelay({
    applicationToken: APPLICATION_TOKEN,
    identity: createGitHubOidcVerifier({
      audience: AUDIENCE,
      fetch: fetchImplementation,
    }),
    grants,
    allowance: createRateLimiter({
      limit: overrides.dailyLimit ?? 50,
      windowMs: 24 * 60 * 60_000,
      maxEntries: 100,
    }),
    quotaFloor: overrides.quotaFloor ?? 500,
    fetch: fetchImplementation,
  });
  return { relay, grants, sent };
}

test("forwards an alarm whose identity and subscription agree", async () => {
  const { relay, grants, sent } = relayUnderTest();
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken(),
    request: { grant, message: "Website is unavailable", title: "Example Status" },
  });

  assert.equal(result.outcome, "delivered");
  assert.equal(result.context.repository, "example/status");
  assert.equal(result.context.repositoryId, OWN_REPOSITORY_ID);
  assert.equal(result.context.remaining, 9_000);

  // The application token is the server's and the recipient comes out of the
  // grant, so neither ever travelled in the request.
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.get("token"), APPLICATION_TOKEN);
  assert.equal(sent[0]!.get("user"), USER_KEY);
  assert.equal(sent[0]!.get("message"), "Website is unavailable");
  assert.equal(sent[0]!.get("title"), "Example Status");
});

test("refuses a proof signed by somebody other than GitHub", async () => {
  const { relay, grants, sent } = relayUnderTest();
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken({}, foreignPair.privateKey),
    request: { grant, message: "Website is unavailable" },
  });

  assert.equal(result.outcome, "refused");
  assert.equal(
    result.outcome === "refused" ? result.error.code : "",
    "NOTIFY_IDENTITY_REJECTED",
  );
  // Nothing about the caller is claimed, because nothing about it was proved.
  assert.equal(result.context.repository, undefined);
  assert.equal(sent.length, 0);
});

test("refuses a proof minted for a different audience", async () => {
  // Without this, any repository's default token would verify here, because
  // every one of them is signed by the same issuer with the same keys.
  const { relay, grants } = relayUnderTest();
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken({ aud: "https://someone-else.example" }),
    request: { grant, message: "Website is unavailable" },
  });

  assert.equal(
    result.outcome === "refused" ? result.error.code : "",
    "NOTIFY_IDENTITY_REJECTED",
  );
});

test("refuses a subscription Velvet did not sign", async () => {
  const { relay, sent } = relayUnderTest();
  const forged = createNotificationGrants({ secret: "x".repeat(32) }).issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken(),
    request: { grant: forged, message: "Website is unavailable" },
  });

  assert.equal(
    result.outcome === "refused" ? result.error.code : "",
    "NOTIFY_GRANT_REJECTED",
  );
  assert.equal(sent.length, 0);
});

test("refuses a subscription belonging to another repository", async () => {
  // The case the whole design exists for: anybody can run a Velvet installation
  // and therefore obtain a valid proof, so a relay that accepted any signed
  // grant would let one installation alarm another operator.
  const { relay, grants, sent } = relayUnderTest();
  const somebodyElses = grants.issue({
    repositoryId: OTHER_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken(),
    request: { grant: somebodyElses, message: "Website is unavailable" },
  });

  assert.equal(
    result.outcome === "refused" ? result.error.code : "",
    "NOTIFY_GRANT_MISMATCHED",
  );
  assert.equal(sent.length, 0);
});

test("refuses once an installation has spent its allowance", async () => {
  const { relay, grants, sent } = relayUnderTest(undefined, { dailyLimit: 2 });
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });
  const send = () =>
    relay.relay({
      identityToken: identityToken(),
      request: { grant, message: "Website is unavailable" },
    });

  assert.equal((await send()).outcome, "delivered");
  assert.equal((await send()).outcome, "delivered");
  const third = await send();

  assert.equal(
    third.outcome === "refused" ? third.error.code : "",
    "NOTIFY_ALLOWANCE_SPENT",
  );
  // A wait is the answer to this one and to no other, so it is the only refusal
  // that says how long.
  assert.equal(
    third.outcome === "refused" ? typeof third.retryAfterSeconds : "absent",
    "number",
  );
  assert.equal(sent.length, 2);
});

test("stops forwarding for everybody once the shared quota runs low", async () => {
  // The quota belongs to the Pushover account and every application on it
  // shares the month, so the floor protects room other senders still need.
  const { relay, grants, sent } = relayUnderTest(
    [{ status: 200, body: { status: 1 }, remaining: 400 }],
    { quotaFloor: 500 },
  );
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });
  const send = () =>
    relay.relay({
      identityToken: identityToken(),
      request: { grant, message: "Website is unavailable" },
    });

  // The first call is what learns the figure, so it goes through.
  assert.equal((await send()).outcome, "delivered");
  const second = await send();

  assert.equal(
    second.outcome === "refused" ? second.error.code : "",
    "NOTIFY_QUOTA_EXHAUSTED",
  );
  assert.equal(second.context.remaining, 400);
  assert.equal(sent.length, 1);
});

test("reports a refusal from Pushover as a refusal", async () => {
  const { relay, grants } = relayUnderTest([
    { status: 400, body: { status: 0, errors: ["user identifier is invalid"] } },
  ]);
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken(),
    request: { grant, message: "Website is unavailable" },
  });

  assert.equal(
    result.outcome === "refused" ? result.error.code : "",
    "NOTIFY_DELIVERY_FAILED",
  );
});

test("treats a 200 that says it failed as a failure", async () => {
  // Pushover answers with a status of its own inside the body, so reading the
  // HTTP code alone would report a refused message as delivered.
  const { relay, grants } = relayUnderTest([
    { status: 200, body: { status: 0, errors: ["application token is invalid"] } },
  ]);
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken(),
    request: { grant, message: "Website is unavailable" },
  });

  assert.equal(
    result.outcome === "refused" ? result.error.code : "",
    "NOTIFY_DELIVERY_FAILED",
  );
});

test("says nothing about the recipient, the grant, or the message", async () => {
  // Everything the relay reports is the context, so this is what decides
  // whether a secret can reach a log at all.
  const { relay, grants } = relayUnderTest();
  const grant = grants.issue({
    repositoryId: OWN_REPOSITORY_ID,
    userKey: USER_KEY,
  });

  const result = await relay.relay({
    identityToken: identityToken(),
    request: { grant, message: "Website is unavailable", title: "Example Status" },
  });

  const reported = JSON.stringify(result.context);
  assert.equal(reported.includes(USER_KEY), false);
  assert.equal(reported.includes(grant), false);
  assert.equal(reported.includes("Website is unavailable"), false);
  assert.equal(reported.includes(APPLICATION_TOKEN), false);
});
