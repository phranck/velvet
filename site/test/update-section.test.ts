import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "bun:test";

import { createSvelteRenderer, type SvelteRenderer } from "./render-svelte.js";

const COMPONENT = "/src/components/update/UpdateSection.svelte";

const release = {
  availableVersion: "2.1.0",
  releaseType: "feature" as const,
  automaticInstallEligible: false,
  releaseNotes: "# Velvet 2.1.0\n\nA native monitor.\n",
};

let renderer: SvelteRenderer;

beforeAll(async () => {
  renderer = await createSvelteRenderer();
});

afterAll(async () => {
  await renderer.close();
});

function elements(html: string): string {
  return html.replaceAll(/<!--.*?-->/gu, "");
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    installedVersion: "2.0.0",
    release,
    automaticSecurityUpdates: true,
    onInstall: () => {},
    onAutomaticChange: () => {},
    ...overrides,
  };
}

test("offers the update with both entry points when one is available", async () => {
  const html = elements(await renderer.render(COMPONENT, props()));

  assert.match(html, /Installed 2\.0\.0/);
  assert.match(html, /2\.1\.0 available/);
  assert.match(html, /Release notes/);
  assert.match(html, /Install update/);
});

test("says it is up to date rather than offering nothing", async () => {
  const html = elements(
    await renderer.render(COMPONENT, props({ installedVersion: "2.1.0" })),
  );

  assert.match(html, /Up to date/);
  assert.equal(html.includes("Install update"), false);
});

test("stays quiet when the service reported nothing usable", async () => {
  const html = elements(await renderer.render(COMPONENT, props({ release: null })));

  assert.match(html, /Up to date/);
  assert.equal(html.includes("Install update"), false);
  assert.equal(html.includes("Release notes"), false);
});

test("explains an outcome in words rather than machine terms", async () => {
  const html = elements(
    await renderer.render(
      COMPONENT,
      props({ updateState: "failed", updateReason: "checks_failed" }),
    ),
  );

  assert.match(html, /did not pass its checks/i);
  assert.match(html, /still running the previous version/i);
  assert.equal(html.includes("checks_failed"), false);
  assert.match(html, /data-tone="warning"/);
});

test("prevents a second install whilst one is still running", async () => {
  const html = elements(
    await renderer.render(
      COMPONENT,
      props({ updateState: "waiting_for_publication" }),
    ),
  );

  assert.match(html, /data-tone="progress"/);
  assert.match(html, /Publishing your page/);
  assert.match(html, /Install update<\/button>/);
  assert.match(html, /disabled/);
});

test("reflects the automatic-security preference and explains its limits", async () => {
  const enabled = elements(await renderer.render(COMPONENT, props()));
  assert.match(enabled, /<input[^>]+type="checkbox"[^>]*checked/);
  assert.match(enabled, /needs? no configuration or data migration/i);

  const disabled = elements(
    await renderer.render(COMPONENT, props({ automaticSecurityUpdates: false })),
  );
  assert.doesNotMatch(disabled, /<input[^>]+type="checkbox"[^>]*checked/);
});

test("labels the section for assistive technology", async () => {
  const html = elements(await renderer.render(COMPONENT, props()));

  assert.match(html, /aria-labelledby="velvet-update-heading"/);
  assert.match(html, /id="velvet-update-heading"/);
  // No live region while there is nothing to announce, so assistive technology
  // is not handed an empty status container to read.
  assert.equal(html.includes('role="status"'), false);

  const announced = elements(
    await renderer.render(COMPONENT, props({ updateState: "succeeded" })),
  );
  assert.match(announced, /role="status"/);
  assert.match(announced, /Update installed/);
});
