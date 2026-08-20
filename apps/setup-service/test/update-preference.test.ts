import assert from "node:assert/strict";
import { test } from "bun:test";

import { parseVelvetConfiguration } from "@velvet/contracts";

import {
  setAutomaticSecurityUpdates,
  setGalleryListing,
  setStatusPageTheme,
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

/**
 * The theme a page is published in.
 *
 * It differs from the two preferences in the one way that matters to the proof
 * afterwards: `statusPage` holds a dozen fields, whilst `updates` and `gallery`
 * hold one each. An edit that disturbed a sibling here has to be caught.
 */

test("writes the theme a page is published in", () => {
  const written = setStatusPageTheme(base, "twenty-forty-nine");
  assert.ok(written);
  assert.match(written, /^ {2}theme: twenty-forty-nine$/mu);
});

test("leaves every other field of the same block where it was", () => {
  const written = setStatusPageTheme(base, "retro-chassis");
  assert.ok(written);
  const parsed = parseVelvetConfiguration(written);
  assert.equal(parsed.success, true);
  if (!parsed.success) throw new Error("unreachable");
  assert.equal(parsed.data.statusPage.name, "Example Status");
  assert.equal(parsed.data.statusPage.theme, "retro-chassis");
  assert.match(written, /# shown in the header/u);
});

test("keeps a comment the user wrote beside the theme", () => {
  const commented = base.replace(
    "  theme: velvet\n",
    "  theme: velvet # the one we started on\n",
  );
  const written = setStatusPageTheme(commented, "ncc-1701-d");
  assert.ok(written);
  assert.match(written, /^ {2}theme: ncc-1701-d # the one we started on$/mu);
});

test("refuses a name that would change the shape of the line", () => {
  for (const name of [
    "velvet: evil",
    'velvet"',
    "velvet\nservices: []",
    "Velvet",
    "",
    " velvet",
  ]) {
    assert.equal(setStatusPageTheme(base, name), null, JSON.stringify(name));
  }
});

test("refuses a configuration that was not valid to begin with", () => {
  assert.equal(setStatusPageTheme("schemaVersion: 1\n", "velvet"), null);
});

test("refuses a status page written as one line rather than emptying it", () => {
  // That form is rewritten whole, which is right for a block holding one field
  // and would drop every sibling here. Refused on purpose rather than left to
  // the contract to catch, which it only does whilst a required field is among
  // the ones that would go.
  const flow = base.replace(
    "statusPage:\n  name: Example Status # shown in the header\n  theme: velvet\n",
    "statusPage: {name: Example Status, theme: velvet, layout: cards}\n",
  );
  assert.equal(setStatusPageTheme(flow, "retro-chassis"), null);
});

test("refuses a file with no status page rather than writing one", () => {
  // The contract requires the block, so a file without it is not one this edit
  // should be completing.
  const without = `schemaVersion: 1
repository:
  owner: example
  name: status
services:
  - name: Website
    url: https://example.com
`;
  assert.equal(setStatusPageTheme(without, "velvet"), null);
});
