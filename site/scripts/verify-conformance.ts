/**
 * Runs the conformance suite over every theme and reports what it found.
 *
 * Run with `bun run --cwd site themes:conform`, optionally narrowed:
 *
 *   bun scripts/verify-conformance.ts --theme retro-chassis
 *   bun scripts/verify-conformance.ts --fixture twenty-services
 *
 * It drives Chromium through Playwright, as the rendered gate it replaces did.
 */

import { chromium } from "playwright";

import { runConformance } from "./conformance.js";

/** Every value given after a named flag, so a flag may be repeated. */
function valuesFor(flag: string): string[] | undefined {
  const values: string[] = [];
  process.argv.forEach((argument, index) => {
    if (argument === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]!);
    }
  });
  return values.length > 0 ? values : undefined;
}

const browser = await chromium.launch();
try {
  const findings = await runConformance(browser, {
    themes: valuesFor("--theme"),
    fixtures: valuesFor("--fixture"),
  });

  if (findings.length === 0) {
    console.log("Every theme conforms against every fixture.");
  } else {
    for (const finding of findings) {
      console.log(
        `  FAIL  ${finding.theme} · ${finding.fixture} · ${finding.check}: ${finding.detail}`,
      );
    }
    console.log(`\n${findings.length} failure(s).`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
