import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

const summaryModule = import("../src/summary.js").catch(() => ({}));

test("writes one concise redacted Actions summary", async () => {
  const module = (await summaryModule) as Record<string, unknown>;
  if (typeof module.writeActionSummary !== "function") {
    assert.fail("@velvet/monitor-action must export writeActionSummary");
  }
  const directory = await mkdtemp(join(tmpdir(), "velvet-summary-"));
  const path = join(directory, "summary.md");
  try {
    const writeActionSummary = module.writeActionSummary as (
      path: string,
      summary: Record<string, unknown>,
    ) => Promise<void>;
    await writeActionSummary(path, {
      mode: "status",
      outcome: "prepared",
      availableChecks: 2,
      unavailableChecks: 1,
      incidentResult: "reconciled",
      commitOutcome: "written",
    });

    assert.equal(
      await readFile(path, "utf8"),
      "## Velvet monitor\n\n" +
        "| Result | Value |\n" +
        "| --- | --- |\n" +
        "| Mode | status |\n" +
        "| Run | prepared |\n" +
        "| Available checks | 2 |\n" +
        "| Unavailable checks | 1 |\n" +
        "| Incidents | reconciled |\n" +
        "| Data commit | written |\n",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("writes a safe failure summary without the underlying cause", async () => {
  const module = (await summaryModule) as Record<string, unknown>;
  if (typeof module.writeActionFailureSummary !== "function") {
    assert.fail(
      "@velvet/monitor-action must export writeActionFailureSummary",
    );
  }
  const directory = await mkdtemp(join(tmpdir(), "velvet-summary-"));
  const path = join(directory, "summary.md");
  try {
    const writeActionFailureSummary = module.writeActionFailureSummary as (
      path: string,
      summary: Record<string, unknown>,
    ) => Promise<void>;
    await writeActionFailureSummary(path, {
      mode: "response",
      code: "INTERNAL_FAILURE",
      errorId: "error-safe-1",
    });

    const source = await readFile(path, "utf8");
    assert.match(source, /\| Mode \| response \|/u);
    assert.match(source, /\| Run \| failed \|/u);
    assert.match(source, /\| Error \| INTERNAL_FAILURE \|/u);
    assert.match(source, /\| Error ID \| error-safe-1 \|/u);
    assert.match(source, /\| Data commit \| failed \|/u);
    assert.equal(source.includes("cause"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
