import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  SESSION_COOKIE_NAME,
  createSessionCookie,
  createSessionStore,
  parseSessionCookie,
} from "../src/session.js";

const secret = "s".repeat(32);
const ids = ["A", "B", "C", "D", "E", "F"].map((value) => value.repeat(43));

test("keeps credentials server-side behind a signed opaque cookie", () => {
  let index = 0;
  const store = createSessionStore({
    secret,
    now: () => 1_000,
    randomToken: () => ids[index++]!,
  });
  const session = store.create();
  session.githubUserToken = "github-user-token";

  const cookieValue = store.cookieValue(session.id);
  assert.equal(cookieValue.includes("github-user-token"), false);
  assert.equal(store.fromCookie(cookieValue)?.githubUserToken, "github-user-token");
  assert.equal(store.fromCookie(`${cookieValue.slice(0, -1)}x`), null);
});

test("rotates the session identifier after authentication", () => {
  let index = 0;
  const store = createSessionStore({
    secret,
    now: () => 1_000,
    randomToken: () => ids[index++]!,
  });
  const session = store.create();
  session.oauth = { state: "state", codeVerifier: "verifier" };

  const rotated = store.rotate(session.id);

  assert.notEqual(rotated.id, session.id);
  assert.equal(store.get(session.id), null);
  assert.deepEqual(rotated.oauth, session.oauth);
});

test("expires sessions and evicts the oldest entry at the configured bound", () => {
  let currentTime = 0;
  let index = 0;
  const store = createSessionStore({
    secret,
    ttlMs: 100,
    maxSessions: 2,
    now: () => currentTime,
    randomToken: () => ids[index++]!,
  });
  const first = store.create();
  currentTime = 10;
  const second = store.create();
  currentTime = 20;
  store.create();

  assert.equal(store.get(first.id), null);
  assert.notEqual(store.get(second.id), null);
  currentTime = 111;
  assert.equal(store.get(second.id), null);
});

test("sets a host-only secure production cookie and parses only that cookie", () => {
  const value = `${ids[0]}.${"Z".repeat(43)}`;
  const cookie = createSessionCookie(value, true, 1_800);

  assert.equal(
    cookie,
    `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=1800; HttpOnly; SameSite=Lax; Secure`,
  );
  assert.equal(
    parseSessionCookie(`unrelated=x; ${SESSION_COOKIE_NAME}=${value}`),
    value,
  );
  assert.equal(parseSessionCookie(`${SESSION_COOKIE_NAME}=bad value`), null);
});

test("keeps the cookie the same size whatever length the token has", () => {
  // A stateless GitHub token runs to around 520 characters. Browsers cap a
  // cookie at roughly four kilobytes, so a token that travelled in one would
  // eventually stop fitting. It never does: the cookie carries an identifier
  // and a signature, and the token stays on the server.
  const token = `ghs_${"A1b2C3d4_-".repeat(52).slice(0, 516)}`;
  assert.equal(token.length, 520);

  let index = 0;
  const store = createSessionStore({
    secret,
    now: () => 1_000,
    randomToken: () => ids[index++]!,
  });
  const short = store.create();
  short.githubUserToken = "gho_short";
  const shortCookie = store.cookieValue(short.id);

  const long = store.create();
  long.githubUserToken = token;
  const longCookie = store.cookieValue(long.id);

  assert.equal(longCookie.length, shortCookie.length);
  assert.equal(longCookie.includes(token), false);
  assert.equal(longCookie.includes("ghs_"), false);
  assert.equal(store.fromCookie(longCookie)?.githubUserToken, token);
});
