import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, test } from "bun:test";

import {
  createSvelteRenderer,
  type SvelteRenderer,
} from "./render-svelte.js";

let renderer: SvelteRenderer;

beforeAll(async () => {
  renderer = await createSvelteRenderer();
});

afterAll(async () => {
  await renderer.close();
});

test("renders the focused onboarding flow with progressive advanced checks", async () => {
  const html = await renderer.render("/src/onboarding/Onboarding.svelte", {});

  assert.match(html, /Set up Velvet/);
  assert.match(html, /Repository owner/);
  assert.match(html, /Repository name/);
  assert.match(html, /Status page name/);
  assert.match(html, /Service name/);
  assert.match(html, /https:\/\/example\.com/);
  assert.match(html, /Advanced health check/);
  assert.match(html, /A normal website only needs a name and URL/);
  assert.match(html, /data-service-icon-picker/);
  assert.match(html, /data-theme-card-group/);
  assert.equal(html.match(/data-theme-card-option/g)?.length, 4);
  assert.match(html, /aria-live="polite"/);
});

test("uses the shared theme and icon components in onboarding and configurator", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const serviceEditor = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/service-editor/ServiceEditorRoot.svelte",
    ),
    "utf8",
  );

  assert.match(onboarding, /import \* as ThemeCard from "\.\.\/components\/theme-card"/);
  assert.match(onboarding, /import \* as ServiceEditor from "\.\.\/components\/service-editor"/);
  assert.match(onboarding, /<ServiceEditor\.List[\s\S]*<ServiceEditor\.Root/);
  assert.doesNotMatch(onboarding, /<article class="service-editor"/);
  assert.match(serviceEditor, /import ServiceIconPicker from "\.\.\/service-icon-picker\/ServiceIconPicker\.svelte"/);
  assert.match(configurator, /import \* as ThemeCard from "\.\.\/components\/theme-card"/);
  assert.match(configurator, /import ServiceIconPicker from "\.\.\/components\/service-icon-picker\/ServiceIconPicker\.svelte"/);
});

test("standalone onboarding uses its own build entry", async () => {
  const html = await readFile(
    resolve(import.meta.dirname, "../onboarding.html"),
    "utf8",
  );
  const viteConfig = await readFile(
    resolve(import.meta.dirname, "../vite.onboarding.ts"),
    "utf8",
  );

  assert.match(html, /<title>Set up Velvet<\/title>/);
  assert.match(html, /src="\/src\/onboarding\/main\.ts"/);
  assert.match(viteConfig, /outDir:\s*onboardingOutDir/);
});

test("offers concrete recovery targets without exposing backend details", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );

  assert.match(onboarding, /data-recovery-links/);
  assert.match(onboarding, />Open repository</);
  assert.match(onboarding, />View failed workflow</);
  assert.match(onboarding, /Reference:/);
});
