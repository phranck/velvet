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
  assert.match(html, /2\.1\.0/);
  assert.match(html, /Feature/);
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

test("says nothing about an installation whose state is not yet known", async () => {
  // Whether a service answered, and what it said, is the manager's business.
  // This component is only ever handed a release it can describe, so it never
  // has to invent a message about not knowing something.
  const source = await Bun.file(
    new URL("../src/configurator/UpdateManager.svelte", import.meta.url),
  ).text();

  assert.match(source, /connection\.state === "offline"/u);
  assert.match(source, /not connected to\s*\n?\s*an installation/u);
  assert.match(source, /\{#if installation\}/u);
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

test("still offers a manual install for a normal release, automatic or not", async () => {
  // The preference only ever covers eligible security releases, so a feature
  // or a fix always needs the reader to act, whatever the setting says.
  for (const automaticSecurityUpdates of [true, false]) {
    const html = elements(
      await renderer.render(COMPONENT, props({ automaticSecurityUpdates })),
    );
    assert.match(html, /Install update/, `automatic=${automaticSecurityUpdates}`);
    assert.equal(
      html.includes("installs this one for you"),
      false,
      `automatic=${automaticSecurityUpdates}`,
    );
  }
});

test("labels the release type, because the automatic setting depends on it", async () => {
  const feature = elements(await renderer.render(COMPONENT, props()));
  assert.match(feature, /Feature/);
  assert.equal(feature.includes("Security update"), false);
  assert.equal(feature.includes("installs this one for you"), false);

  const security = elements(
    await renderer.render(
      COMPONENT,
      props({
        release: {
          availableVersion: "2.0.1",
          releaseType: "security",
          automaticInstallEligible: true,
          releaseNotes: "# Velvet 2.0.1\n",
        },
      }),
    ),
  );
  assert.match(security, /Security update/);
  assert.match(security, /data-tone="security"/);
  assert.match(security, /installs this one for you/);
  // Offering a manual install for something that installs itself asks the
  // reader to trigger what is already happening.
  assert.equal(security.includes("Install update"), false);
});

test("does not promise an unattended install the preference has turned off", async () => {
  const html = elements(
    await renderer.render(
      COMPONENT,
      props({
        automaticSecurityUpdates: false,
        release: {
          availableVersion: "2.0.1",
          releaseType: "security",
          automaticInstallEligible: true,
          releaseNotes: "# Velvet 2.0.1\n",
        },
      }),
    ),
  );

  assert.match(html, /Security update/);
  assert.equal(html.includes("installs this one for you"), false);
  // With the preference off, the reader has to act, so the action is offered.
  assert.match(html, /Install update/);
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

test("leaves the heading to its container and hides decorative icons", async () => {
  const html = elements(await renderer.render(COMPONENT, props()));

  // The Configurator section around this already provides the title and icon,
  // so a second heading here would duplicate it in the document outline.
  assert.equal(/<h[1-6]/u.test(html), false);
  for (const icon of html.match(/<i class="ph-duotone[^>]*>/gu) ?? []) {
    assert.match(icon, /aria-hidden="true"/, icon);
  }
  assert.equal(html.includes('role="status"'), false);

  const announced = elements(
    await renderer.render(COMPONENT, props({ updateState: "succeeded" })),
  );
  assert.match(announced, /role="status"/);
  assert.match(announced, /Update installed/);
});
