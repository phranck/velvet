/**
 * The gate that holds a bundle to the isolation rules.
 *
 * Run with `bun scripts/verify-bundles.ts` from `site/`, or through
 * `bun run bundles:verify`. It reads files and never opens a browser, so it
 * fails in the second it takes to read a directory rather than after a build.
 *
 * What a browser resolved is a different question and has a different gate: the
 * conformance suite renders a bundle against a fixture and checks what it said.
 * This one checks only that a bundle could not have reached outside itself.
 */

import {
  checkBundle,
  type BundleViolation,
} from "../src/lib/bundles/isolation.js";
import { BUNDLES_ROOT, readBundles } from "./bundles.js";

const bundles = await readBundles();
const failures: string[] = [];
const notes: string[] = [];

if (bundles.length === 0) {
  failures.push(`no bundles found under ${BUNDLES_ROOT}`);
}

for (const bundle of bundles) {
  if (!bundle.manifest) {
    for (const error of bundle.manifestErrors) {
      failures.push(`${bundle.directory}  manifest: ${error}`);
    }
    continue;
  }
  const violations: BundleViolation[] = checkBundle({
    manifest: bundle.manifest,
    directory: bundle.directory,
    files: bundle.files,
  });
  for (const violation of violations) {
    failures.push(
      `${bundle.directory}  ${violation.rule}: ${violation.file} ${violation.detail}`,
    );
  }
  if (violations.length === 0) {
    notes.push(
      `${bundle.directory}  ${bundle.files.length} file(s), data version ${bundle.manifest.dataVersion}, layouts ${bundle.manifest.layouts.join(" and ")}`,
    );
  }
}

for (const note of notes) console.log(`  ok    ${note}`);
console.log("");
if (failures.length === 0) {
  console.log(`All ${bundles.length} bundle(s) stay inside themselves.`);
} else {
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  console.log(`\n${failures.length} failure(s).`);
  process.exitCode = 1;
}
