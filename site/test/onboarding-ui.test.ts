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

  assert.match(html, /Velvet/);
  assert.match(html, /ONBOARDING/);
  assert.match(html, /data-rainbow-scale/);
  assert.equal(html.match(/data-rainbow-color/g)?.length, 9);
  assert.doesNotMatch(html, /Set up Velvet/);
  assert.doesNotMatch(html, /Your status page, without local setup/);
  assert.doesNotMatch(html, /Monitoring and publishing with GitHub/);
  assert.match(html, /Your GitHub name/);
  assert.match(html, /GitHub username or organization that should own the repository/);
  assert.match(html, /Repository name/);
  assert.match(html, /Velvet creates this repository for your status page/);
  assert.match(html, /Status page name/);
  assert.match(html, /Custom domain \(optional\)/);
  assert.doesNotMatch(html, /DNS change required/);
  assert.match(html, /Service name/);
  assert.match(html, /Shown publicly on your status page/);
  assert.match(html, /URL to monitor/);
  assert.match(html, /normal website URL or a dedicated health endpoint/);
  assert.match(html, /https:\/\/example\.com/);
  assert.match(html, /Advanced health check/);
  assert.match(html, /A name and URL are enough/);
  assert.match(html, /data-service-icon-picker/);
  assert.match(html, /data-theme-card-group/);
  assert.equal(html.match(/data-theme-card-option/g)?.length, 4);
  assert.match(html, /aria-live="polite"/);
  assert.equal(html.match(/data-squircle-step=""/g)?.length, 4);
  assert.equal(html.match(/data-step-connector/g)?.length, 3);
  assert.match(html, />Basics</);
  assert.match(html, /data-step-card-viewport/);
  assert.match(html, /data-form-actions-card/);
  assert.match(html, /© by/);
  assert.match(html, /href="https:\/\/layered\.work"/);
  assert.match(html, /target="_blank"/);
});

test("uses the local Barlow family for onboarding typography", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const styles = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/onboarding.css"),
    "utf8",
  );

  assert.match(styles, /@fontsource\/barlow\/latin-400\.css/);
  assert.match(styles, /@fontsource\/barlow\/latin-600\.css/);
  assert.match(styles, /@fontsource\/barlow-condensed\/latin-600\.css/);
  assert.match(styles, /font-family:\s*"Barlow"/);
  assert.match(onboarding, /--setup-text-small:\s*0\.9375rem/);
  assert.match(onboarding, /--setup-text-body:\s*1rem/);
  assert.match(onboarding, /--setup-text-lead:\s*1\.125rem/);
  assert.match(onboarding, /--service-editor-small-font-size:\s*var\(--setup-text-small\)/);
  assert.match(onboarding, /--theme-card-font-size:\s*var\(--setup-text-body\)/);
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
  assert.match(onboarding, /import RainbowScale from "\.\.\/components\/RainbowScale\.svelte"/);
  assert.match(configurator, /import RainbowScale from "\.\.\/components\/RainbowScale\.svelte"/);
});

test("uses a shared rainbow scale with clearly different edge hues", async () => {
  const rainbowScale = await readFile(
    resolve(import.meta.dirname, "../src/components/RainbowScale.svelte"),
    "utf8",
  );

  assert.match(rainbowScale, /"#ff453a"/);
  assert.match(
    rainbowScale,
    /"#ffd60a",\s*\n\s*"#30d158",\s*\n\s*"#00c7be",\s*\n\s*"#64d2ff"/,
  );
  assert.match(rainbowScale, /"#bf5af2",\s*\n\s*\] as const/);
  assert.doesNotMatch(rainbowScale, /"#ff375f"/);
});

test("uses reusable squircle steps and directional card motion", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const squircleStep = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/SquircleStep.svelte"),
    "utf8",
  );

  assert.match(onboarding, /import SquircleStep from "\.\/SquircleStep\.svelte"/);
  assert.match(onboarding, /createViewTransitionController/);
  assert.match(onboarding, /view-transition-name:\s*onboarding-step-card/);
  assert.match(onboarding, /onboarding-slide-out-forward/);
  assert.match(onboarding, /onboarding-slide-in-backward/);
  assert.match(onboarding, /animation-duration:\s*350ms/);
  assert.match(onboarding, /animation-timing-function:\s*ease-in-out/);
  assert.match(squircleStep, /data-squircle-step/);
  assert.match(squircleStep, /createSquircleRectPath/);
  assert.match(squircleStep, /bind:clientWidth/);
  assert.match(squircleStep, /bind:clientHeight/);
  assert.doesNotMatch(squircleStep, /preserveAspectRatio="none"/);
  assert.match(squircleStep, /stroke-width="1"/);
  assert.match(squircleStep, /stroke-width="4"/);
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
