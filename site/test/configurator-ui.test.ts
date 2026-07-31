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

test("renders the local controls in a right sidebar and two real services", async () => {
  const html = await renderer.render(
    "/src/configurator/Configurator.svelte",
    {},
  );

  assert.match(html, /class="velvet-wordmark(?:\s|")/);
  assert.match(html, /data-velvet-tool-brand/);
  assert.match(html, /data-velvet-tool-subtitle/);
  assert.match(html, /aria-label="CONFIGURATOR"/);
  assert.match(html, /Local only/);
  assert.ok((html.match(/type="color"/g)?.length ?? 0) >= 6);
  assert.ok((html.match(/data-color-value/g)?.length ?? 0) >= 6);
  assert.match(html, /data-theme-picker/);
  assert.match(html, /Theme name/);
  assert.match(html, /name="theme-name"/);
  assert.match(html, /Text Primary/);
  assert.match(html, /Text Secondary/);
  assert.match(html, /Text Tertiary/);
  assert.match(html, /Overrides/);
  assert.match(html, /Theme Default/);
  assert.match(html, /Cloudy blobs/);
  assert.match(html, /Card border/);
  assert.match(html, /Card shadow/);
  assert.match(html, /Card width/);
  assert.match(html, /Service icon/);
  assert.match(html, /Grouped/);
  assert.match(html, /Separate cards/);
  assert.match(html, /accept="\.yml,\.yaml/);
  assert.match(html, /Open Config/);
  assert.match(html, /Copy Config/);
  assert.match(html, /Download Config/);
  assert.doesNotMatch(html, /Save Config as/);
  assert.match(html, /ph-folder-open/);
  assert.match(html, /ph-copy/);
  assert.match(html, /ph-download-simple/);
  assert.equal(html.match(/data-configurator-section/g)?.length, 9);
  assert.equal(html.match(/<details[^>]+open/g)?.length, 11);
  assert.equal(html.match(/data-slider-tick/g)?.length, 9);
  assert.match(html, /data-toggle-all-sections/);
  assert.match(html, /Collapse all sections/);
  assert.match(html, /ph-caret-circle-double-down/);
  assert.equal(html.match(/ph-caret-circle-down/g)?.length, 13);
  assert.match(html, /data-sidebar-collapse-toggle/);
  assert.match(html, /ph-caret-circle-double-left/);
  assert.match(html, /aria-controls="velvet-configurator-sidebar-content"/);
  assert.match(html, /id="velvet-configurator-sidebar-content"/);
  assert.match(html, /class="sidebar-footer(?:\s|")/);
  assert.match(html, /Loaded Velvet Default\./);
  assert.match(html, /name="ipv4-line-style"/);
  assert.doesNotMatch(html, /name="ipv6-line-style"/);
  assert.match(html, /Chart fill/);
  assert.match(html, /Canvas color/);
  assert.match(html, /Canvas opacity/);
  assert.match(html, /id="chart-background-opacity"/);
  assert.match(html, /aria-live="polite"/);
  assert.equal(html.match(/<section class="card(?:\s|")/g)?.length, 1);
  assert.doesNotMatch(html, /class="preview-frame(?:\s|")/);
  assert.doesNotMatch(html, /class="nav(?:\s|")/);
  assert.ok(html.indexOf("preview-workspace") < html.indexOf("control-panel"));
  assert.match(html, /data-layout="grouped"/);
  assert.match(html, /Website/);
  assert.match(html, /Backend/);
  assert.match(html, /IPv4/);
  assert.doesNotMatch(html, /IPv6/);
  assert.match(html, /Response time/);

  const expectedSectionTitles = [
    "Theme",
    "Services",
    "Named Colors",
    "Background",
    "Cards",
    "Response Graph",
    "Service Layout",
    "Overrides",
  ];
  let previousSectionIndex = -1;
  for (const title of expectedSectionTitles) {
    const sectionIndex = html.indexOf(title);
    assert.ok(
      sectionIndex > previousSectionIndex,
      `${title} should follow the preceding configurator section`,
    );
    previousSectionIndex = sectionIndex;
  }
  assert.doesNotMatch(html, /Named colors/);
  assert.doesNotMatch(html, /Advanced overrides/);

  const source = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const rainbowScale = await readFile(
    resolve(import.meta.dirname, "../src/components/RainbowScale.svelte"),
    "utf8",
  );
  assert.match(
    source,
    /<ConfiguratorSection\s+id="themes"[\s\S]*?icon="ph-sparkle"/,
  );
  assert.match(source, /<StatusPage[\s\S]*?showNavigation=\{false\}/);
  assert.match(
    rainbowScale,
    /\.rainbow-scale\s*\{[^}]*grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    source,
    /const directFileSavesAvailable =\s*typeof window !== "undefined" &&\s*supportsFileSystemAccess\(window\);/,
  );
  assert.match(
    source,
    /\{#if directFileSavesAvailable\}[\s\S]*?Save Config[\s\S]*?Save Config as[\s\S]*?\{:else\}[\s\S]*?Download Config[\s\S]*?\{\/if\}/,
  );
  assert.match(source, /import \* as ServiceEditor from "\.\.\/components\/service-editor"/);
  assert.match(source, /<ServiceEditor\.List[\s\S]*<ServiceEditor\.Root/);
  assert.match(html, /data-service-editor-list/);
  assert.match(html, /Add another service/);
  assert.doesNotMatch(html, /Service Icons/);
});

test("uses a full-workspace theme background and readable sidebar typography", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const sections = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ConfiguratorSection.svelte"),
    "utf8",
  );

  assert.match(source, /<main class="preview-workspace"[^>]+bind:this=/);
  assert.doesNotMatch(source, /linear-gradient\(rgba\(255, 255, 255, 0\.018\) 1px/);
  assert.doesNotMatch(source, /onToggleService=\{\(\) => undefined\}/);
  assert.match(source, /\.button[\s\S]*font-size:\s*14px/);
  assert.match(source, /\.section-help[\s\S]*font-size:\s*13px/);
  assert.match(sections, /summary[\s\S]*font-size:\s*15px/);
  assert.match(
    sections,
    /summary\s*\{[^}]*background:\s*var\(--tool-panel-raised\)/s,
  );
  assert.match(sections, /summary\s*\{[^}]*margin:\s*0 -22px/s);
  assert.match(sections, /summary\s*\{[^}]*padding:\s*17px 22px/s);
  assert.match(sections, /summary\s*\{[^}]*border-radius:\s*0/s);
  assert.match(
    sections,
    /\.caret\s*\{[^}]*width:\s*22px[^}]*height:\s*22px[^}]*display:\s*inline-block[^}]*font-size:\s*22px/s,
  );
  assert.match(
    source,
    /\.section-toolbar button\s*\{[^}]*width:\s*100%[^}]*justify-content:\s*space-between/s,
  );
  assert.match(
    source,
    /\.section-toolbar i\s*\{[^}]*width:\s*22px[^}]*height:\s*22px[^}]*display:\s*inline-block[^}]*font-size:\s*22px/s,
  );
  assert.match(sections, /class="section-content-inner"/);
  assert.doesNotMatch(
    sections,
    /\.section-content\s*\{[^}]*padding:/s,
  );
  assert.doesNotMatch(
    sections,
    /\.section-content\s*\{[^}]*overflow:\s*clip/s,
  );
  assert.match(
    sections,
    /\.section-content-inner\s*\{[^}]*padding:\s*0 0 20px/s,
  );
  assert.doesNotMatch(sections, /details\s*\{[^}]*border-bottom:/s);
});

test("keeps the desktop sidebar fixed while the embedded footer uses the remaining preview height", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(configurator, /@media \(min-width:\s*1101px\)/);
  assert.match(
    configurator,
    /\.configurator\s*\{[^}]*height:\s*100vh[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    configurator,
    /\.preview-workspace\s*\{[^}]*height:\s*100vh[^}]*display:\s*flex[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    configurator,
    /\.preview-surface\s*\{[^}]*--status-page-min-height:\s*100%[^}]*flex:\s*1 1 0[^}]*min-height:\s*0[^}]*overflow:\s*visible/s,
  );
});

test("restores and continuously persists the complete configurator session", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(
    configurator,
    /loadConfiguratorSession\([\s\S]*?typeof localStorage === "undefined"/,
  );
  assert.match(
    configurator,
    /\$effect\(\(\) => \{[\s\S]*?persistConfiguratorSession\(\s*\{[\s\S]*?importedDocument[\s\S]*?selectedBaseline/,
  );
  assert.match(configurator, /\$state\.snapshot\(importedDocument\)/);
});

test("uses one subtly raised surface scale across the sidebar", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(source, /--tool-panel:\s*#1b1d26/);
  assert.match(source, /--tool-panel-raised:\s*#272a36/);
  assert.match(source, /--tool-input:\s*#171922/);
  assert.match(source, /--tool-line:\s*#363a47/);
  assert.match(
    source,
    /\.control-panel\s*\{[^}]*background:\s*var\(--tool-panel\)/s,
  );
  assert.match(
    source,
    /\.segmented\s*\{[^}]*background:\s*var\(--tool-input\)/s,
  );
  assert.match(
    source,
    /\.segmented input:checked \+ span\s*\{[^}]*background:\s*var\(--tool-panel-raised\)/s,
  );
});

test("places the vertical page gradient in the Background section", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const backgroundSection = source.match(
    /<ConfiguratorSection\s+id="background"[\s\S]*?<\/ConfiguratorSection>/,
  )?.[0];
  const advancedSection = source.match(
    /<ConfiguratorSection\s+id="advanced"[\s\S]*?<\/ConfiguratorSection>/,
  )?.[0];

  assert.ok(backgroundSection);
  assert.match(backgroundSection, /class="background-gradient"/);
  assert.match(backgroundSection, /name="background-start" label="Background top"/);
  assert.match(backgroundSection, /name="background-end" label="Background bottom"/);
  assert.ok(advancedSection);
  assert.doesNotMatch(advancedSection, /name="background-start"/);
  assert.doesNotMatch(advancedSection, /name="background-end"/);
});

test("shows the active custom theme instead of a registry fallback", async () => {
  const html = await renderer.render(
    "/src/configurator/ThemeDropdown.svelte",
    {
      themes: [],
      selectedId: null,
      currentName: "Cloudy Custom",
      currentPalette: {
        canvas: "#111111",
        foreground: "#eeeeee",
        accent: "#6366f1",
        alternate: "#38bdf8",
        warning: "#d29922",
        danger: "#f85149",
        textPrimary: "#eeeeee",
        textSecondary: "#999999",
        textTertiary: "#666666",
      },
      modified: true,
      onSelect: () => undefined,
    },
  );

  assert.match(html, /Cloudy Custom/);
  assert.equal(html.match(/data-color-swatch/g)?.length, 9);
  assert.equal(html.match(/fill="#[0-9a-f]{6}"/gi)?.length, 9);
});

test("gives every advanced color and switch control a stable form identity", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const colorSource = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ColorSourceControl.svelte"),
    "utf8",
  );

  assert.match(colorSource, /id=\{`\$\{name\}-picker`\}/);
  assert.match(colorSource, /id=\{`\$\{name\}-text`\}/);
  assert.match(colorSource, /name=\{`\$\{name\}-source`\}/);
  assert.match(configurator, /id="chart-fill"/);
  assert.match(configurator, /id="cloudy-blobs-enabled"/);
  assert.match(configurator, /id="card-border-enabled"/);
  assert.match(configurator, /id="card-shadow-enabled"/);
  assert.match(configurator, /name="service-icon"/);
});

test("uses interactive squircles for every native color picker", async () => {
  const namedColors = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ColorControl.svelte"),
    "utf8",
  );
  const advancedOverrides = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ColorSourceControl.svelte"),
    "utf8",
  );

  assert.match(namedColors, /import ColorSwatch from "\.\/ColorSwatch\.svelte"/);
  assert.match(namedColors, /<ColorSwatch color=\{value\} size=\{28\}>[\s\S]*type="color"[\s\S]*<\/ColorSwatch>/);
  assert.doesNotMatch(namedColors, /input\[type="color"\]\s*\{/);
  assert.match(advancedOverrides, /import ColorSwatch from "\.\/ColorSwatch\.svelte"/);
  assert.match(advancedOverrides, /<ColorSwatch color=\{resolved\} size=\{32\}>[\s\S]*type="color"[\s\S]*<\/ColorSwatch>/);
  assert.doesNotMatch(advancedOverrides, /input\[type="color"\]\s*\{/);
});

test("restores persisted section state before the first details render", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(
    source,
    /let sectionState = \$state\(readStoredSectionState\(\)\)/,
  );
  assert.doesNotMatch(source, /onMount\(\(\) => \{\s*try \{\s*sectionState/);
});

test("keeps reset sticky and uses the shared save and disclosure flows", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const section = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ConfiguratorSection.svelte"),
    "utf8",
  );

  assert.match(configurator, /class="sidebar-footer"/);
  assert.match(configurator, /\.sidebar-footer[\s\S]*position:\s*sticky[\s\S]*bottom:\s*0/);
  assert.match(
    configurator,
    /\.reset-button\s*\{[^}]*border:\s*1px solid var\(--tool-line\)[^}]*border-radius:\s*999px/,
  );
  assert.match(configurator, /saveShortcutAction\(event\)/);
  assert.match(configurator, /requestSaveConfigurationAs/);
  assert.doesNotMatch(configurator, /ThemeNameDialog/);
  assert.match(
    configurator,
    /\.file-actions \.save-as\s*\{[^}]*grid-column:\s*1 \/ -1/s,
  );
  assert.match(configurator, /data-dirty-status/);
  assert.doesNotMatch(configurator, /SECTION_FLIP_KEYFRAMES/);
  assert.doesNotMatch(configurator, /waitForAnimation/);
  assert.doesNotMatch(section, /ontoggle=/);
  assert.match(section, /event\.preventDefault\(\)/);
  assert.match(section, /createDisclosureMotion/);
  assert.match(section, /data-section-expanded=\{open\}/);
  assert.match(section, /bind:open=\{renderedOpen\}/);
  assert.doesNotMatch(section, /open=\{initialOpen\}/);
});

test("collapses the complete sidebar into a persistent narrow rail", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(configurator, /SIDEBAR_STORAGE_KEY/);
  assert.match(configurator, /createScrollCompensation/);
  assert.match(configurator, /bind:this=\{controlScroll\}/);
  assert.match(configurator, /parseSidebarCollapsed/);
  assert.match(configurator, /serializeSidebarCollapsed/);
  assert.match(configurator, /class:collapsed=\{sidebarCollapsed\}/);
  assert.match(configurator, /inert=\{sidebarCollapsed\}/);
  assert.match(
    configurator,
    /\.control-panel\.collapsed\s*\{[^}]*width:\s*48px/s,
  );
  assert.match(
    configurator,
    /\.control-panel\s*\{[^}]*transition:\s*width 160ms ease-in-out/s,
  );
  assert.match(
    configurator,
    /\.sidebar-toggle\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/s,
  );
  assert.match(
    configurator,
    /\.sidebar-toggle i\s*\{[^}]*font-size:\s*22px/s,
  );
  assert.match(
    configurator,
    /\.control-scroll\s*\{[^}]*overflow-anchor:\s*none/s,
  );
  assert.match(configurator, /\.sidebar-toggle\.expanded[\s\S]*rotate\(180deg\)/);
});

test("places the expanded sidebar control in its scrolling header and keeps a persistent rail control", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const scrollingHeader = configurator.match(
    /<div class="control-scroll" bind:this=\{controlScroll\}>\s*<header class="tool-header">([\s\S]*?)<\/header>/,
  )?.[1];

  assert.ok(scrollingHeader);
  assert.match(scrollingHeader, /data-sidebar-collapse-toggle/);
  assert.match(
    configurator,
    /\{#if sidebarCollapsed\}[\s\S]*data-sidebar-expand-toggle[\s\S]*\{\/if\}/,
  );
  assert.ok(
    configurator.indexOf("data-sidebar-expand-toggle") <
      configurator.indexOf('id="velvet-configurator-sidebar-content"'),
  );
  assert.match(
    configurator,
    /function toggleSidebar\(\): void \{[\s\S]*persistSidebarCollapsed\(sidebarCollapsed\);/,
  );
});

test("shares one accessible custom listbox across themes and color sources", async () => {
  const customListbox = await readFile(
    resolve(import.meta.dirname, "../src/configurator/CustomListbox.svelte"),
    "utf8",
  );
  const themeDropdown = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ThemeDropdown.svelte"),
    "utf8",
  );
  const colorSource = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ColorSourceControl.svelte"),
    "utf8",
  );

  assert.match(customListbox, /aria-haspopup="listbox"/);
  assert.match(customListbox, /role="listbox"/);
  assert.match(customListbox, /role="option"/);
  assert.match(customListbox, /event\.key === "ArrowDown"/);
  assert.match(customListbox, /event\.key === "ArrowUp"/);
  assert.match(customListbox, /event\.key === "Escape"/);
  assert.match(customListbox, /document\.addEventListener\("pointerdown", handleDocumentPointerDown\)/);
  assert.match(customListbox, /document\.addEventListener\("keydown", handleDocumentKeydown\)/);
  assert.match(customListbox, /!root\.contains\(event\.target as Node\)/);
  assert.match(customListbox, /document\.removeEventListener\("pointerdown", handleDocumentPointerDown\)/);
  assert.match(customListbox, /document\.removeEventListener\("keydown", handleDocumentKeydown\)/);
  assert.match(customListbox, /resolveListboxPlacement/);
  assert.match(customListbox, /class:open-up/);
  assert.match(customListbox, /style:max-height/);
  assert.match(customListbox, /import ColorSwatch from "\.\/ColorSwatch\.svelte"/);
  assert.match(customListbox, /<ColorSwatch\s+\{color\}\s+size=\{compact \? 22 : 14\}/);
  assert.match(customListbox, /option\.value === value \? 'ph-check-fat' : 'ph-blank'/);
  assert.doesNotMatch(customListbox, /\? 'ph-check' : 'ph-blank'/);
  assert.doesNotMatch(customListbox, /data-listbox-swatch/);
  assert.match(themeDropdown, /import CustomListbox from "\.\/CustomListbox\.svelte"/);
  assert.match(colorSource, /import CustomListbox from "\.\/CustomListbox\.svelte"/);
  assert.doesNotMatch(colorSource, /<select/);
});

test("gives custom listbox rows distinct hover and focus states", async () => {
  const customListbox = await readFile(
    resolve(import.meta.dirname, "../src/configurator/CustomListbox.svelte"),
    "utf8",
  );

  assert.doesNotMatch(
    customListbox,
    /\.listbox-options button\s*\{[^}]*transition:/s,
  );
  assert.match(
    customListbox,
    /\.listbox-options button:hover,\s*\.listbox-options button:focus-visible\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--tool-accent\) 20%, var\(--tool-input\)\)/s,
  );
  assert.match(
    customListbox,
    /\.listbox-options button\[aria-selected="true"\]\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--tool-accent\) 12%, var\(--tool-input\)\)/s,
  );
});

test("restores listbox focus after Escape without retaining its focus ring", async () => {
  const customListbox = await readFile(
    resolve(import.meta.dirname, "../src/configurator/CustomListbox.svelte"),
    "utf8",
  );

  assert.match(customListbox, /let suppressTriggerFocusRing = \$state\(false\)/);
  assert.match(customListbox, /closeAndRestoreFocus\(true\)/);
  assert.match(customListbox, /class:suppress-focus-ring=\{suppressTriggerFocusRing\}/);
  assert.match(
    customListbox,
    /\.listbox-trigger:focus-visible:not\(\.suppress-focus-ring\)/,
  );
});

test("centers the compact configurator header without intro copy or a separator", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const brand = await readFile(
    resolve(import.meta.dirname, "../src/components/VelvetToolBrand.svelte"),
    "utf8",
  );

  assert.doesNotMatch(
    configurator,
    /<p>Tune the page in place\. No file contents leave your browser\.<\/p>/,
  );
  assert.match(
    configurator,
    /import VelvetToolBrand from "\.\.\/components\/VelvetToolBrand\.svelte"/,
  );
  assert.match(
    configurator,
    /<VelvetToolBrand subtitle="CONFIGURATOR"\s*\/>/,
  );
  assert.match(
    brand,
    /\.velvet-tool-palette,\s*\.velvet-tool-subtitle\s*\{[^}]*width:\s*var\(--tool-brand-inner-width,\s*94%\)/s,
  );
  assert.match(
    brand,
    /\.velvet-tool-subtitle\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/s,
  );
  assert.match(brand, /subtitle\.toUpperCase\(\)\.split\(""\)/);
  assert.match(
    configurator,
    /\.configurator-brand\s*\{[^}]*margin:\s*0 auto[^}]*--tool-brand-accent:\s*var\(--tool-accent\)/s,
  );
  assert.match(configurator, /\.tool-header\s*\{[^}]*text-align:\s*center/s);
  assert.doesNotMatch(configurator, /\.tool-header\s*\{[^}]*border-bottom:/s);
});

test("replaces browser focus outlines with Velvet focus states", async () => {
  const globalStyles = await readFile(
    resolve(import.meta.dirname, "../src/configurator/configurator.css"),
    "utf8",
  );
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const namedColors = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ColorControl.svelte"),
    "utf8",
  );
  const advancedOverrides = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ColorSourceControl.svelte"),
    "utf8",
  );
  assert.match(
    globalStyles,
    /:where\(button, input, textarea, select, summary, a, \[tabindex\]\):focus\s*\{[^}]*outline:\s*none/s,
  );
  for (const source of [configurator, namedColors, advancedOverrides]) {
    assert.match(
      source,
      /input[^\n{]*:focus-visible\s*\{[^}]*border-color:[^}]*box-shadow:/s,
    );
  }
});

test("uses a lighter borderless alert surface", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(
    configurator,
    /\.message\s*\{[^}]*background:\s*var\(--tool-panel-raised\)/s,
  );
  assert.doesNotMatch(configurator, /\.message\s*\{[^}]*border(?:-bottom)?:/s);
});

test("stacks every advanced override control in one aligned column", async () => {
  const colorSource = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ColorSourceControl.svelte"),
    "utf8",
  );

  assert.match(colorSource, /\.source-control\s*\{[\s\S]*display:\s*grid[\s\S]*gap:/);
  assert.doesNotMatch(colorSource, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+148px/);
  assert.doesNotMatch(colorSource, /grid-column:\s*2/);
  assert.match(colorSource, /\.color-value[\s\S]*width:\s*100%/);
});
