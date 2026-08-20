import assert from "node:assert/strict";
import { test } from "bun:test";

import { settlingIn } from "../src/status.js";

/**
 * What a page says whilst it has nothing to show.
 *
 * A page in its first hours is almost empty, and somebody who has just set
 * Velvet up cannot tell that apart from a page that is broken. This is the one
 * sentence that tells them.
 */

const NOW = "2026-08-21T12:00:00.000Z";

test("speaks whilst the page has nothing to show yet", () => {
  assert.match(
    settlingIn("2026-08-21T09:00:00.000Z", NOW) ?? "",
    /started watching this page today/u,
  );
});

test("stops once the page speaks for itself", () => {
  // A day, because the response times are checked four times a day and a page
  // is only furnished once that slower one has run a few times.
  assert.equal(settlingIn("2026-08-20T11:00:00.000Z", NOW), null);
  assert.equal(settlingIn("2026-01-01T00:00:00.000Z", NOW), null);
});

test("says nothing about a clock it cannot read", () => {
  // Absent rather than shown: a page whose timestamps are unreadable has larger
  // problems, and announcing that it is new would be a guess.
  assert.equal(settlingIn("not a date", NOW), null);
  assert.equal(settlingIn(NOW, "not a date"), null);
});
