import assert from "node:assert/strict";
import { test } from "bun:test";
import { chromium } from "playwright";

import { runConformance } from "../scripts/conformance.js";

/**
 * The conformance suite as a test, so it runs with everything else that needs a
 * browser rather than only when somebody remembers the command.
 *
 * It carries `browser` in its name for the same reason the other browser tests
 * do: the runner fetches no Chromium, and `test:headless` is everything that
 * needs nothing but Bun.
 */

const CONFORMANCE_TIMEOUT_MS = 300_000;

test(
  "every bundle conforms against every fixture",
  async () => {
    const browser = await chromium.launch();
    try {
      const findings = await runConformance(browser);
      assert.deepEqual(
        findings.map(
          (finding) =>
            `${finding.bundle} · ${finding.fixture} · ${finding.check}: ${finding.detail}`,
        ),
        [],
      );
    } finally {
      await browser.close();
    }
  },
  CONFORMANCE_TIMEOUT_MS,
);
