/**
 * The gate that holds a theme to the isolation rules.
 *
 * Run with `bun scripts/verify-themes.ts` from `site/`, or through
 * `bun run themes:verify`. It reads files and never opens a browser, so it
 * fails in the second it takes to read a directory rather than after a build.
 *
 * What a browser resolved is a different question and has a different gate: the
 * conformance suite renders a theme against a fixture and checks what it said.
 * This one checks only that a theme could not have reached outside itself.
 */

import {
  checkTheme,
  type ThemeViolation,
} from "../src/lib/themes/isolation.js";
import { THEMES_ROOT, readThemes } from "./themes.js";

const themes = await readThemes();
const failures: string[] = [];
const notes: string[] = [];

if (themes.length === 0) {
  failures.push(`no themes found under ${THEMES_ROOT}`);
}

for (const theme of themes) {
  if (!theme.manifest) {
    for (const error of theme.manifestErrors) {
      failures.push(`${theme.directory}  manifest: ${error}`);
    }
    continue;
  }
  const violations: ThemeViolation[] = checkTheme({
    manifest: theme.manifest,
    directory: theme.directory,
    files: theme.files,
  });
  for (const violation of violations) {
    failures.push(
      `${theme.directory}  ${violation.rule}: ${violation.file} ${violation.detail}`,
    );
  }
  if (violations.length === 0) {
    notes.push(
      `${theme.directory}  ${theme.files.length} file(s), data version ${theme.manifest.dataVersion}, layouts ${theme.manifest.layouts.join(" and ")}`,
    );
  }
}

for (const note of notes) console.log(`  ok    ${note}`);
console.log("");
if (failures.length === 0) {
  console.log(`All ${themes.length} theme(s) stay inside themselves.`);
} else {
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  console.log(`\n${failures.length} failure(s).`);
  process.exitCode = 1;
}
