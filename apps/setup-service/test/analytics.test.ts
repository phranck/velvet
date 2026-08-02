import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

import {
  analyticsOrigin,
  withAnalytics,
  type AnalyticsConfiguration,
} from "../src/analytics.js";

const CONFIGURED: AnalyticsConfiguration = {
  scriptUrl: "https://analytics.example.com/script.js",
  websiteId: "11111111-2222-3333-4444-555555555555",
};

const DOCUMENT = "<!doctype html>\n<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body></body>\n</html>\n";

test("serves the document untouched when an instance collects nothing", () => {
  // The default for everyone who installs Velvet and configures no analytics.
  assert.equal(withAnalytics(DOCUMENT, null), DOCUMENT);
  assert.equal(analyticsOrigin(null), null);
});

test("adds the configured script to the document it serves", () => {
  const served = withAnalytics(DOCUMENT, CONFIGURED);

  assert.match(served, /<script defer src="https:\/\/analytics\.example\.com\/script\.js"/u);
  assert.match(served, /data-website-id="11111111-2222-3333-4444-555555555555"/u);
  // Inside the head, because a deferred script belongs there and because that
  // is the only place the document guarantees.
  assert.ok(
    served.indexOf("<script defer") < served.indexOf("</head>"),
    "the tag has to land inside the head",
  );
  assert.ok(served.includes("<body></body>"), "the rest is left alone");
});

test("grants the origin rather than the script path", () => {
  // A policy grants origins. Naming the path would grant nothing usable and
  // the script would be refused whilst the configuration looked correct.
  assert.equal(analyticsOrigin(CONFIGURED), "https://analytics.example.com");
});

test("the onboarding bundle actually receives the script", async () => {
  // The injection depends on the built document having a </head> to insert
  // before. Asserting it against the real bundle is what keeps that true as
  // the page changes, rather than only against a handwritten fixture.
  const bundle = await readFile(
    new URL("../../../onboarding/index.html", import.meta.url),
    "utf8",
  );

  const served = withAnalytics(bundle, CONFIGURED);

  assert.notEqual(served, bundle, "the built onboarding page must take the tag");
  assert.match(served, /data-website-id="11111111-2222-3333-4444-555555555555"/u);
  // And it carries none of its own, so a fork serves nobody else's analytics.
  assert.equal(bundle.includes("data-website-id"), false);
  assert.equal(bundle.includes("umami"), false);
});
