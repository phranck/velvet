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
  const currentYear = new Date().getFullYear();

  assert.match(html, /Velvet/);
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
  // Five steps: the four the visitor fills in, plus Install, which reports the
  // setup rather than collecting anything.
  assert.equal(html.match(/data-squircle-step=""/g)?.length, 5);
  assert.equal(html.match(/data-step-connector/g)?.length, 4);
  assert.match(html, />Basics</);
  assert.match(html, />Review</);
  assert.match(html, /data-step-card=""/);
  assert.match(html, /data-step-card-viewport/);
  assert.match(html, /data-step-card-body/);
  assert.match(html, /data-step-card-footer/);
  assert.match(html, /data-review-list/);
  assert.equal(html.match(/data-review-item/g)?.length, 4);
  assert.equal(html.match(/data-review-squircle/g)?.length, 4);
  // One heading per step, Install included.
  assert.equal(html.match(/data-step-title-separator/g)?.length, 5);
  // Six rather than five: one before each step title, and one more in the bar
  // before the version, which onboarding now takes from the site.
  assert.equal(html.match(/>\/\/</g)?.length, 6);
  assert.doesNotMatch(html, /data-form-actions-card/);
  assert.match(html, new RegExp(`© ${currentYear} by`));
  assert.match(html, /href="https:\/\/layered\.work"/);
  assert.match(html, /target="_blank"/);
});

test("uses the local Datatype family for onboarding typography", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const styles = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/onboarding.css"),
    "utf8",
  );
  // The faces and the sizes are declared once for every Velvet tool and reached
  // from here, so the chain is what this checks rather than the location.
  const tokens = await readFile(
    resolve(import.meta.dirname, "../src/lib/velvet-tokens.css"),
    "utf8",
  );
  // The faces live apart from the values, because a status page shares some of
  // them and the tools carry others it never renders.
  const shell = await readFile(
    resolve(import.meta.dirname, "../src/lib/velvet-board-shell.css"),
    "utf8",
  );

  assert.match(styles, /@import "\.\.\/lib\/velvet-tokens\.css"/);
  assert.match(styles, /@import "\.\.\/lib\/velvet-board-shell\.css"/);
  assert.match(shell, /@import "\.\/velvet-retro-typefaces\.css"/);

  // Declared in these two rather than taken from the stylesheets `@fontsource`
  // ships, because those state `font-display: swap`, which is what makes a
  // heading appear in one face and then change to another.
  //
  // Two files, because a published status page renders the mark and the code
  // face but none of the faces the tools are set in. The tools' file imports
  // the shared one, so naming it reaches both.
  const shared = await readFile(
    resolve(import.meta.dirname, "../src/lib/velvet-typefaces.css"),
    "utf8",
  );
  const tools = await readFile(
    resolve(import.meta.dirname, "../src/lib/velvet-retro-typefaces.css"),
    "utf8",
  );
  assert.match(tools, /@import "\.\/velvet-typefaces\.css"/);
  const typefaces = `${shared}\n${tools}`;
  for (const file of [
    "plaster-latin-400-normal.woff2",
    "fira-code-latin-400-normal.woff2",
    "fira-code-latin-600-normal.woff2",
    "datatype-latin-wght-normal.woff2",
    "workbench-latin-400-normal.woff2",
    "space-mono-latin-700-normal.woff2",
    "audiowide-latin-400-normal.woff2",
    "doto-latin-600-normal.woff2",
  ]) {
    assert.ok(typefaces.includes(file), `${file} is not declared`);
  }
  // Read past the comments, which name the other values in order to explain why
  // they are not used here.
  const declarations = typefaces.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  // Counted against the faces that actually fetch a file rather than against a
  // fixed number, so adding one cannot quietly ship without it. The
  // metric-matched stand-ins declare no `src: url()` and are not among them.
  const fetched = (declarations.match(/@font-face\s*\{[^}]*url\(/g) ?? []).length;
  assert.equal(
    (declarations.match(/font-display:\s*block/g) ?? []).length,
    fetched,
    "every fetched face blocks, or the page is drawn once in one face and again in another",
  );
  assert.match(tokens, /--velvet-font:\s*"Datatype"/);
  assert.match(tokens, /--velvet-text-caption:\s*0\.8125rem/);
  assert.match(tokens, /--velvet-text-small:\s*0\.9375rem/);
  assert.match(tokens, /--velvet-text-body:\s*1rem/);
  // The aliases the onboarding shares with the website are declared in the
  // token file, because both surfaces stated them and one had already drifted.
  // Asserted there rather than here for the reason the comment at the top of
  // this test gives: what matters is that the chain reaches a token, not which
  // file states the link.
  assert.match(tokens, /--setup-text-small:\s*var\(--velvet-text-small\)/);
  assert.match(tokens, /--setup-text-body:\s*var\(--velvet-text-body\)/);
  assert.match(tokens, /--setup-text-intro:\s*var\(--velvet-text-intro\)/);
  assert.match(tokens, /--setup-text-copy:\s*var\(--velvet-text-copy\)/);
  // These two the onboarding states for itself, because a form is worked
  // through rather than read and the website sets both a step larger.
  assert.match(onboarding, /--setup-text-lead:\s*1\.125rem/);
  // The caption size is shared with the website, which sets a version at it, so
  // the value is stated once and reached from here.
  assert.match(onboarding, /--setup-text-caption:\s*var\(--velvet-text-caption\)/);
  assert.match(onboarding, /--setup-card-copy:\s*var\(--setup-text-copy\)/);
  assert.match(
    onboarding,
    /Tell Velvet what to watch, choose a design, and publish through your[\s\S]*GitHub account\./,
  );
});

test("uses the shared theme and icon components in onboarding", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const serviceEditor = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/service-editor/ServiceEditorRoot.svelte",
    ),
    "utf8",
  );
  const serviceItem = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/service-editor/ServiceEditorItem.svelte",
    ),
    "utf8",
  );
  const serviceEditorIndex = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/service-editor/index.ts",
    ),
    "utf8",
  );
  const iconPicker = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/service-icon-picker/ServiceIconPicker.svelte",
    ),
    "utf8",
  );
  const iconOption = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/service-icon-picker/ServiceIconOption.svelte",
    ),
    "utf8",
  );
  const themeCardRoot = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/theme-card/ThemeCardRoot.svelte",
    ),
    "utf8",
  );

  assert.match(onboarding, /import \* as ThemeCard from "\.\.\/components\/theme-card"/);
  assert.match(onboarding, /import \* as ServiceEditor from "\.\.\/components\/service-editor"/);
  assert.match(
    onboarding,
    /<ServiceEditor\.List[\s\S]*<ServiceEditor\.Item[\s\S]*<ServiceEditor\.Root/,
  );
  assert.doesNotMatch(onboarding, /<article class="service-editor"/);
  assert.match(serviceEditorIndex, /default as Item/);
  assert.match(serviceItem, /out:collapseServiceItem\|global/);
  assert.match(serviceItem, /duration:\s*reducedMotion \? 0 : 350/);
  assert.match(serviceItem, /margin-bottom:\s*\$\{t \* marginBottom\}px/);
  assert.match(serviceItem, /opacity:\s*\$\{t\}/);
  assert.match(serviceEditor, /import ServiceIconPicker from "\.\.\/service-icon-picker\/ServiceIconPicker\.svelte"/);
  assert.doesNotMatch(iconPicker, /resolveListboxPlacement|aria-haspopup|aria-expanded/);
  assert.doesNotMatch(iconPicker, /class="trigger"|class:open|inert=/);
  assert.match(iconPicker, /role="listbox"/);
  assert.match(iconPicker, /tabIndex=\{option\.value === value \? 0 : -1\}/);
  assert.match(iconPicker, /handleOptionKeydown/);
  assert.match(iconPicker, /import ServiceIconOption from "\.\/ServiceIconOption\.svelte"/);
  assert.match(iconPicker, /AUTOMATIC_SERVICE_ICON/);
  assert.match(iconPicker, /icon:\s*AUTOMATIC_SERVICE_ICON/);
  assert.doesNotMatch(iconPicker, /automaticIcon/);
  assert.match(iconPicker, /<ServiceIconOption/);
  assert.match(onboarding, /--picker-icon-size:\s*1\.875rem/);
  assert.match(
    iconPicker,
    /<legend>\{legend\}<\/legend>[\s\S]*\{#if description\}<p>\{description\}<\/p>\{\/if\}[\s\S]*class="options"/,
  );
  // The shape and its insets come from `lib/squircle`, so this option cannot
  // drift from the onboarding steps and the theme cards that draw the same one.
  assert.match(iconOption, /createSquirclePath,?\s*\n?\s*\} from "\.\.\/\.\.\/lib\/squircle\.js"/);
  assert.match(iconOption, /SQUIRCLE_OUTER_PATH_INSET/);
  assert.match(iconOption, /SQUIRCLE_INNER_PATH_INSET/);
  assert.doesNotMatch(iconOption, /const OUTER_PATH_INSET/);
  assert.match(iconOption, /data-service-icon-squircle/);
  assert.match(iconOption, /class="selection-outline outer"[^>]*d=\{outerPath\}/);
  assert.match(iconOption, /class="selection-outline inner"[^>]*d=\{innerPath\}/);
  assert.match(iconOption, /stroke-width="1"/);
  assert.match(iconOption, /stroke-width="4"/);
  assert.match(
    iconOption,
    /\.selection-outline\s*\{[^}]*transform:\s*scale\(var\(--picker-selection-scale,\s*1\)\)[^}]*transform-box:\s*fill-box[^}]*transform-origin:\s*center[^}]*vector-effect:\s*non-scaling-stroke/s,
  );
  assert.doesNotMatch(iconOption, /button\[aria-selected="true"\]::after/);
  assert.match(
    iconOption,
    /\.option-background\s*\{[^}]*transition:\s*none/s,
  );
  assert.match(iconOption, /\.selection-outline\s*\{[^}]*transition:\s*opacity 200ms ease-in-out/s);
  assert.match(
    iconOption,
    /\.service-icon-option > \.service-icon-option-icon\s*\{[^}]*transition:\s*none/s,
  );
  assert.match(
    iconOption,
    /var\(--picker-accent,\s*#6366f1\) 28%,\s*var\(--picker-popover,/s,
  );
  assert.match(
    iconOption,
    /\.service-icon-option:hover > \.service-icon-option-icon,\s*\.service-icon-option:focus-visible > \.service-icon-option-icon\s*\{[^}]*transform:\s*scale\(1\.1\)/s,
  );
  assert.match(
    onboarding,
    /import SiteHeader from "\.\.\/components\/SiteHeader\.svelte"/,
  );
  assert.match(onboarding, /<SiteHeader navigation=\{false\} \/>/);
  assert.doesNotMatch(onboarding, /import RainbowScale|import VelvetWordmark/);
  assert.match(
    onboarding,
    /--theme-card-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    themeCardRoot,
    /grid-template-columns:\s*var\(\s*--theme-card-columns,\s*repeat\(2, minmax\(0, 1fr\)\)\s*\)/,
  );
  assert.match(themeCardRoot, /<h3>\{legend\}<\/h3>/);
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
  assert.match(onboarding, /import \* as StepCard from "\.\.\/components\/step-card"/);
  assert.match(
    onboarding,
    /<StepCard\.Root>[\s\S]*<StepCard\.Body[\s\S]*<StepCard\.Footer>/,
  );
  assert.match(onboarding, /createViewTransitionController/);
  assert.match(onboarding, /view-transition-name:\s*onboarding-step-card/);
  assert.match(onboarding, /onboarding-slide-out-forward/);
  assert.match(onboarding, /onboarding-slide-in-backward/);
  assert.match(onboarding, /animation-duration:\s*350ms/);
  assert.match(onboarding, /animation-timing-function:\s*ease-in-out/);
  assert.match(
    onboarding,
    /mask-image:\s*linear-gradient\([\s\S]*var\(--step-card-content-inset\)[\s\S]*calc\(100% - var\(--step-card-content-inset\)\)/,
  );
  assert.match(
    onboarding,
    /::view-transition-group\(onboarding-step-card-shell\)[\s\S]*animation-duration:\s*350ms/,
  );
  assert.match(onboarding, /transform:\s*translateX\(-100%\)/);
  assert.match(onboarding, /transform:\s*translateX\(100%\)/);
  assert.doesNotMatch(onboarding, /transform:\s*translateX\(-?10%\)/);
  assert.match(squircleStep, /data-squircle-step/);
  assert.match(squircleStep, /data-step-active-highlight/);
  assert.match(squircleStep, /transition:\s*opacity 350ms ease-in-out/);
  assert.match(squircleStep, /createSquirclePath/);
  assert.match(squircleStep, /bind:clientWidth/);
  assert.doesNotMatch(squircleStep, /bind:clientHeight/);
  assert.doesNotMatch(squircleStep, /preserveAspectRatio="none"/);
  assert.match(squircleStep, /stroke-width="1"/);
  assert.match(squircleStep, /stroke-width="4"/);
  // The column count comes from the step list rather than a literal, so adding
  // a step cannot wrap the row the way a fifth one did.
  assert.match(
    onboarding,
    /grid-template-columns:\s*repeat\(var\(--step-count, 4\), var\(--step-size\)\)/,
  );
  assert.match(onboarding, /--step-count: \$\{STEPS\.length\}/);
  // The rates matter rather than the figures: five tiles and four gaps come to
  // under the window's width at every size, so the row needs no breakpoint to
  // stop it overflowing a phone.
  assert.match(onboarding, /--step-size:\s*clamp\(2\.75rem, 14vw, 5\.5rem\)/);
  assert.match(onboarding, /left:\s*calc\(100% \+ 5px\)/);
  assert.doesNotMatch(onboarding, /\.steps li\s*\{[^}]*flex:\s*1 1 0/s);
});

test("exposes the reusable StepCard compound component", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const index = await readFile(
    resolve(import.meta.dirname, "../src/components/step-card/index.ts"),
    "utf8",
  );
  const root = await readFile(
    resolve(import.meta.dirname, "../src/components/step-card/StepCardRoot.svelte"),
    "utf8",
  );
  const body = await readFile(
    resolve(import.meta.dirname, "../src/components/step-card/StepCardBody.svelte"),
    "utf8",
  );
  const footer = await readFile(
    resolve(import.meta.dirname, "../src/components/step-card/StepCardFooter.svelte"),
    "utf8",
  );
  const geometry = await readFile(
    resolve(import.meta.dirname, "../src/components/step-card/geometry.ts"),
    "utf8",
  );
  assert.match(index, /Root/);
  assert.match(index, /Body/);
  assert.match(index, /Footer/);
  assert.match(root, /data-step-card/);
  assert.match(body, /data-step-card-body/);
  assert.match(footer, /data-step-card-footer/);
  // The two figures the rest is derived from, asserted as figures rather than
  // as the ones they happen to be today. Pinning the values turned every
  // deliberate change to the card into a failure with nothing wrong behind it,
  // whilst what this test is about is the shape of the compound component and
  // the fact that nothing repeats what can be derived.
  const radius = geometry.match(/STEP_CARD_RADIUS\s*=\s*(\d+)/);
  const inset = geometry.match(/STEP_CARD_CONTENT_INSET\s*=\s*(\d+)/);
  assert.ok(radius, "the card states a radius");
  assert.ok(inset, "the card states a content inset");
  assert.match(
    geometry,
    /STEP_CARD_FOOTER_INSET\s*=\s*STEP_CARD_CONTENT_INSET/,
  );
  assert.match(
    geometry,
    /STEP_CARD_INNER_RADIUS\s*=\s*deriveNestedCornerRadius\(\s*STEP_CARD_RADIUS,\s*STEP_CARD_CONTENT_INSET,\s*\)/,
  );
  assert.match(
    geometry,
    /STEP_CARD_BUTTON_RADIUS\s*=\s*STEP_CARD_INNER_RADIUS/,
  );
  assert.match(root, /STEP_CARD_RADIUS/);
  assert.match(root, /STEP_CARD_INNER_RADIUS/);
  assert.match(root, /STEP_CARD_BUTTON_RADIUS/);
  assert.match(root, /view-transition-name:\s*onboarding-step-card-shell/);
  assert.match(
    onboarding,
    /--step-card-inner-radius:\s*\$\{STEP_CARD_INNER_RADIUS\}px/,
  );
  // The buttons take the card's inner radius, which is what makes them look
  // like they belong inside it. The rule lives in the shared surface now, so
  // that is where the pairing is checked.
  assert.doesNotMatch(onboarding, /import SquircleSurface/);
  assert.doesNotMatch(onboarding, /<SquircleSurface/);
  assert.match(onboarding, /data-step-card-button-label/);
});

test("derives normal onboarding card and button radii from the StepCard geometry", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const serviceEditor = await readFile(
    resolve(import.meta.dirname, "../src/components/service-editor/ServiceEditorRoot.svelte"),
    "utf8",
  );
  const serviceList = await readFile(
    resolve(import.meta.dirname, "../src/components/service-editor/ServiceEditorList.svelte"),
    "utf8",
  );
  const iconPicker = await readFile(
    resolve(import.meta.dirname, "../src/components/service-icon-picker/ServiceIconPicker.svelte"),
    "utf8",
  );
  const iconOption = await readFile(
    resolve(import.meta.dirname, "../src/components/service-icon-picker/ServiceIconOption.svelte"),
    "utf8",
  );
  const themeOption = await readFile(
    resolve(import.meta.dirname, "../src/components/theme-card/ThemeCardOption.svelte"),
    "utf8",
  );
  const reviewItem = await readFile(
    resolve(import.meta.dirname, "../src/components/review-list/ReviewListItem.svelte"),
    "utf8",
  );

  assert.match(onboarding, /--service-editor-card-radius:\s*var\(--step-card-inner-radius\)/);
  assert.match(onboarding, /--service-editor-control-radius:\s*var\(--step-card-inner-radius\)/);
  assert.match(onboarding, /--picker-popover-radius:\s*var\(--step-card-inner-radius\)/);
  assert.doesNotMatch(onboarding, /--picker-option-radius/);
  assert.match(onboarding, /--review-card-radius:\s*var\(--step-card-inner-radius\)/);

  assert.match(iconOption, /createSquirclePath/);
  assert.doesNotMatch(iconOption, /button\s*\{[^}]*border-radius/s);
  // A theme option is cut to the same squircle rather than to a radius, so it
  // must not carry one either.
  assert.match(themeOption, /createSquirclePath/);
  assert.doesNotMatch(themeOption, /label\s*\{[^}]*border-radius/s);
  assert.doesNotMatch(serviceEditor, /<SquircleSurface/);
  assert.doesNotMatch(serviceList, /<SquircleSurface/);
  assert.doesNotMatch(iconPicker, /<SquircleSurface/);
  assert.doesNotMatch(themeOption, /<SquircleSurface/);
  assert.doesNotMatch(reviewItem, /<SquircleSurface/);
  assert.match(reviewItem, /--review-card-radius/);
  assert.match(iconPicker, /--picker-popover-radius/);
});

test("uses the reusable ReviewList compound component for the publish summary", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const item = await readFile(
    resolve(import.meta.dirname, "../src/components/review-list/ReviewListItem.svelte"),
    "utf8",
  );

  assert.match(onboarding, /import \* as ReviewList from "\.\.\/components\/review-list"/);
  assert.match(
    onboarding,
    /<ReviewList\.Root>[\s\S]*<ReviewList\.Item[\s\S]*<\/ReviewList\.Root>/,
  );
  assert.match(
    onboarding,
    /label=\{draft\.services\.length === 1 \? "Service" : "Services"\}/,
  );
  assert.doesNotMatch(onboarding, /class="review-grid"/);
  assert.doesNotMatch(onboarding, /accent=/);
  assert.match(item, /data-review-card/);
  assert.doesNotMatch(item, /--review-accent/);
  assert.doesNotMatch(item, /<SquircleSurface/);
  assert.match(item, /\.review-card::before\s*\{[\s\S]*mask-image:\s*linear-gradient\([\s\S]*#000 80%[\s\S]*transparent 100%/);
  assert.match(item, /grid-template-columns:\s*3\.75rem minmax\(0, 1fr\)/);
  assert.doesNotMatch(onboarding, />Back<|>Continue</);
});

test("uses visible onboarding input borders and compact text buttons", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const serviceList = await readFile(
    resolve(import.meta.dirname, "../src/components/service-editor/ServiceEditorList.svelte"),
    "utf8",
  );

  assert.match(onboarding, /--service-editor-button-padding-inline:\s*0\.5rem/);
  assert.match(serviceList, /data-service-editor-actions/);
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

test("marks every required field and explains the mark once per card", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const serviceEditor = await readFile(
    resolve(import.meta.dirname, "../src/components/service-editor/ServiceEditorRoot.svelte"),
    "utf8",
  );

  // Six fields are enforced by the step checks, measured by emptying each one
  // in onboarding-state.test.ts. Each has to carry the mark, and each has to
  // tell assistive technology the same thing through `required`, which is where
  // that belongs rather than on a decorative icon.
  for (const label of ["Your GitHub name", "Repository name", "Status page name"]) {
    assert.match(
      onboarding,
      new RegExp(`<span>${label}<RequiredField\\.Mark /></span>`),
      label,
    );
  }
  for (const label of ["Service name", "\\{urlLabel\\}", "Healthy status codes"]) {
    assert.match(
      serviceEditor,
      new RegExp(`<span>${label}<RequiredField\\.Mark /></span>`),
      label,
    );
  }
  // Counted as an attribute on an input rather than as the word anywhere, since
  // the import path contains it too.
  const requiredInputs = (source: string) =>
    (source.match(/<input\b[^>]*\brequired\b/g) ?? []).length;
  assert.equal(requiredInputs(onboarding), 3);
  assert.equal(requiredInputs(serviceEditor), 3);

  // The optional two must not be marked, or the mark means nothing.
  assert.doesNotMatch(onboarding, /Custom domain \(optional\)<RequiredField\.Mark/);
  assert.doesNotMatch(onboarding, /Description \(optional\)<RequiredField\.Mark/);

  // One legend per card that carries marks, which is the two collecting steps.
  assert.equal((onboarding.match(/<RequiredField\.Legend \/>/g) ?? []).length, 2);
});

test("defers the theme previews and reserves the space they will take", async () => {
  const option = await readFile(
    resolve(import.meta.dirname, "../src/components/theme-card/ThemeCardOption.svelte"),
    "utf8",
  );

  // The four previews weigh 360 KB together, more than the application bundle,
  // and the step showing them sits behind two forms. Measured before this
  // change: all four were fetched whilst the first step was on screen.
  assert.match(option, /<img[^>]*\bloading="lazy"/);

});

test("offers an optional description that becomes the page's SEO copy", async () => {
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );
  const state = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/state.ts"),
    "utf8",
  );

  assert.match(onboarding, /<span>Description \(optional\)<\/span>/);
  // Capped in the field as well as in the contract, so the limit is met before
  // the whole configuration is rejected over it.
  assert.match(onboarding, /maxlength="300"/);
  assert.match(state, /seo: \{ description \}/);
});

test("asks before deleting a repository, and renders the question as a modal", async () => {
  const html = await renderer.render("/src/onboarding/Onboarding.svelte", {});
  const onboarding = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );

  // A dialog element rather than a panel in the flow, so the question takes
  // focus and Escape answers it.
  assert.match(html, /<dialog[^>]*data-repository-conflict/);
  assert.match(onboarding, /showModal\(\)/);
  assert.match(onboarding, /data-choose-another-name/);
  assert.match(onboarding, /data-replace-repository/);
  // What is lost has to be said before it is lost.
  assert.match(onboarding, /This cannot be undone/);
  // The destructive answer never carries the primary variant.
  assert.doesNotMatch(
    onboarding,
    /velvet-button--primary[\s\S]{0,200}data-replace-repository/,
  );
  // And it is the only place the onboarding offers the danger variant.
  assert.equal(onboarding.match(/velvet-button--danger/g)?.length, 1);
});

test("resumes at the last step only when there is a draft to publish", async () => {
  // Coming back from GitHub lands on the publish step only when a draft was
  // restored with it. A visitor who arrives with nothing entered starts at the
  // first step rather than being asked to check entries they never made.
  const source = await readFile(
    resolve(import.meta.dirname, "../src/onboarding/Onboarding.svelte"),
    "utf8",
  );

  assert.match(source, /GITHUB_RETURN && RESTORED_DRAFT \? INSTALL_STEP : 0/);
  assert.doesNotMatch(source, /GITHUB_RETURN \? INSTALL_STEP : 0/);
});
