import assert from "node:assert/strict";
import { test } from "bun:test";

import { parseVelvetConfiguration } from "@velvet/contracts";

import {
  setAutomaticSecurityUpdates,
  setGalleryListing,
} from "../src/update-preference.js";

const base = `# The services this page watches.
schemaVersion: 1
repository:
  owner: example
  name: status
statusPage:
  name: Example Status # shown in the header
  theme: velvet
services:
  - name: Website
    url: https://example.com
`;

/** Everything about a configuration except the preference being changed. */
function withoutPreference(source: string): string {
  const parsed = parseVelvetConfiguration(source);
  assert.equal(parsed.success, true);
  if (!parsed.success) throw new Error("unreachable");
  return JSON.stringify({
    ...parsed.data,
    updates: { automaticSecurityUpdates: null },
  });
}

test("adds the preference to a configuration that has never carried one", () => {
  const written = setAutomaticSecurityUpdates(base, false);

  assert.equal(typeof written, "string");
  assert.equal(written!.startsWith(base), true, "the original text is untouched");
  assert.match(written!, /\nupdates:\n {2}automaticSecurityUpdates: false\n$/u);
  assert.equal(withoutPreference(written!), withoutPreference(base));
});

test("flips an existing preference without disturbing its file", () => {
  const source = `${base}updates:\n  automaticSecurityUpdates: true\n`;

  const written = setAutomaticSecurityUpdates(source, false);

  assert.equal(written, `${base}updates:\n  automaticSecurityUpdates: false\n`);
  assert.equal(withoutPreference(written!), withoutPreference(source));
});

test("keeps the comment a user wrote beside the preference", () => {
  const source = `${base}updates:\n  automaticSecurityUpdates: true # decided 2026-01-04\n`;

  const written = setAutomaticSecurityUpdates(source, false);

  assert.match(
    written!,
    /automaticSecurityUpdates: false # decided 2026-01-04/u,
  );
});

test("follows the file's own indentation and skips comments above the key", () => {
  const source = `${base}updates:\n    # Kept deliberately.\n    automaticSecurityUpdates: true\n`;

  const written = setAutomaticSecurityUpdates(source, false);

  assert.equal(
    written,
    `${base}updates:\n    # Kept deliberately.\n    automaticSecurityUpdates: false\n`,
  );
});

test("changes a preference written in flow style on one line", () => {
  const source = `${base}updates: {automaticSecurityUpdates: true} # inline\n`;

  const written = setAutomaticSecurityUpdates(source, false);

  assert.equal(
    written,
    `${base}updates: {automaticSecurityUpdates: false} # inline\n`,
  );
  assert.equal(withoutPreference(written!), withoutPreference(source));
});

test("fills in an empty flow mapping rather than refusing it", () => {
  const source = `${base}updates: {}\n`;

  const written = setAutomaticSecurityUpdates(source, false);

  assert.equal(written, `${base}updates: {automaticSecurityUpdates: false}\n`);
});

test("preserves every comment in the file", () => {
  const written = setAutomaticSecurityUpdates(base, true);

  assert.match(written!, /^# The services this page watches\./u);
  assert.match(written!, /name: Example Status # shown in the header/u);
});

test("refuses a shape it cannot change with a single-line edit", () => {
  // Flow style spread over several lines is valid YAML that no one-line edit
  // can express. Refusing keeps the file exactly as its owner wrote it.
  const spread = `${base}updates: {\n  automaticSecurityUpdates: true,\n}\n`;

  assert.equal(setAutomaticSecurityUpdates(spread, false), null);
});

test("refuses a configuration that was not valid to begin with", () => {
  assert.equal(setAutomaticSecurityUpdates("services: []\n", true), null);
});

test("returns the same text when the preference already holds", () => {
  const source = `${base}updates:\n  automaticSecurityUpdates: true\n`;

  assert.equal(setAutomaticSecurityUpdates(source, true), source);
});

test("adds the gallery answer to a configuration that has never carried one", () => {
  const written = setGalleryListing(base, true);

  assert.equal(typeof written, "string");
  assert.equal(written!.startsWith(base), true, "the original text is untouched");
  assert.match(written!, /gallery:\n {2}listed: true\n/u);
});

test("turns a given gallery answer back off", () => {
  const source = `${base}gallery:\n  listed: true\n`;

  const written = setGalleryListing(source, false);

  assert.equal(written, `${base}gallery:\n  listed: false\n`);
});

test("keeps the comment beside the gallery answer", () => {
  const source = `${base}gallery:\n  listed: true # yes, name us\n`;

  const written = setGalleryListing(source, false);

  assert.equal(written, `${base}gallery:\n  listed: false # yes, name us\n`);
});

test("writes the gallery answer without disturbing the update preference", () => {
  const source = `${base}updates:\n  automaticSecurityUpdates: false\n`;

  const written = setGalleryListing(source, true);

  assert.equal(typeof written, "string");
  const parsed = parseVelvetConfiguration(written!);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data.gallery, { listed: true });
  assert.deepEqual(parsed.data.updates, { automaticSecurityUpdates: false });
  assert.equal(
    written!.includes("# The services this page watches."),
    true,
    "the comments the owner wrote survive",
  );
});

test("refuses a gallery block it cannot edit rather than rewriting the file", () => {
  const source = `${base}gallery: &anchor\n  listed: true\n`;

  assert.equal(setGalleryListing(source, false), null);
});
