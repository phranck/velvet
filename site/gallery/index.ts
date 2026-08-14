/**
 * The gallery: every installed theme, each in a frame of its own.
 *
 * This page carries no theme and shares nothing with the ones it shows. A
 * frame is a document, so a theme's stylesheet, its script and its typefaces
 * stay inside it, and two themes on one screen cannot reach each other or the
 * page holding them.
 *
 * The one control is which installation to render. The fixtures are the cases
 * the conformance suite runs against, so a theme that looks wrong here is a
 * theme that will look wrong on somebody's page.
 */

import { FIXTURES } from "../theme-bundles/fixtures/index.js";
import { INSTALLED_THEMES } from "../src/lib/themes/installed.js";

/** One part of this page, or a failure naming which one is missing. */
function part<Element extends HTMLElement>(selector: string): Element {
  const found = document.querySelector<Element>(selector);
  if (!found) throw new Error(`The gallery has no ${selector}.`);
  return found;
}

const picker = part<HTMLSelectElement>("#fixture");
const summary = part("#fixture-what");
const host = part("#themes");

for (const fixture of FIXTURES) {
  const option = document.createElement("option");
  option.value = fixture.name;
  option.textContent = fixture.name;
  picker.append(option);
}

/** The frame for one theme, and the head above it naming what it is. */
function panel(
  id: string,
  name: string,
  era: string | undefined,
  description: string,
): HTMLElement {
  const block = document.createElement("section");
  block.className = "theme";

  const head = document.createElement("div");
  head.className = "theme-head";
  const title = document.createElement("span");
  title.className = "theme-name";
  title.textContent = name;
  const when = document.createElement("span");
  when.className = "theme-era";
  when.textContent = era ?? "";
  const open = document.createElement("a");
  open.className = "theme-open";
  open.textContent = "open on its own";
  const line = document.createElement("span");
  line.className = "theme-what";
  line.textContent = description;
  head.append(title, when, open, line);

  const frame = document.createElement("iframe");
  frame.title = name;
  block.append(head, frame);
  block.dataset.theme = id;
  return block;
}

const frames = INSTALLED_THEMES.map((theme) => {
  const block = panel(
    theme.manifest.id,
    theme.manifest.name,
    theme.manifest.era,
    theme.manifest.description,
  );
  host.append(block);
  return block;
});

/** Points every frame at the chosen installation. */
function show(fixtureName: string): void {
  const fixture = FIXTURES.find((candidate) => candidate.name === fixtureName);
  summary.textContent = fixture?.what ?? "";
  for (const block of frames) {
    const address = `./theme.html?theme=${encodeURIComponent(block.dataset.theme ?? "")}&fixture=${encodeURIComponent(fixtureName)}`;
    const frame = block.querySelector("iframe");
    const link = block.querySelector("a");
    if (frame) frame.src = address;
    if (link) link.href = address;
  }
}

picker.addEventListener("change", () => show(picker.value));
show(FIXTURES[0]!.name);
