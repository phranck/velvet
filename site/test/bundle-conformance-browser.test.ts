import assert from "node:assert/strict";
import { test } from "bun:test";

/**
 * The conformance suite as a test, so it runs with everything else that needs a
 * browser rather than only when somebody remembers the command.
 *
 * It carries `browser` in its name for the same reason the other browser tests
 * do: the runner fetches no Chromium, and `test:headless` is everything that
 * needs nothing but Bun.
 *
 * It runs the suite as a process of its own rather than calling it in this one.
 * The suite renders each design's template here and bundles each design's script
 * with `Bun.build`, so the same plugin module is both loaded into this runtime
 * and read again by the bundler, and Bun 1.3.6 fails that second read with
 * `EISDIR` or `Unseekable` on a path that is a plain file. A process also runs
 * the suite exactly as it is run by hand, so the test and the command cannot
 * drift apart.
 */

const CONFORMANCE_TIMEOUT_MS = 300_000;

test(
  "every bundle conforms against every fixture",
  async () => {
    const run = Bun.spawn(["bun", "scripts/verify-conformance.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, errors, status] = await Promise.all([
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
      run.exited,
    ]);
    assert.equal(status, 0, `${output}\n${errors}`);
  },
  CONFORMANCE_TIMEOUT_MS,
);
