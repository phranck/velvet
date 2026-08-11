/**
 * The gallery: every installed design, each in a frame of its own.
 *
 * This page carries no design and shares nothing with the ones it shows. A
 * frame is a document, so a design's stylesheet, its script and its typefaces
 * stay inside it, and two designs on one screen cannot reach each other or the
 * page holding them. That is what the mockup toolbar could only promise.
 *
 * The one control is which installation to render. The fixtures are the cases
 * the conformance suite runs against, so a design that looks wrong here is a
 * design that will look wrong on somebody's page.
 */

import { FIXTURES } from "../bundles/fixtures/index.js";
import { INSTALLED_DESIGNS } from "../src/lib/bundles/installed.js";

const picker = document.querySelector<HTMLSelectElement>("#fixture");
const what = document.querySelector<HTMLElement>("#fixture-what");
const host = document.querySelector<HTMLElement>("#designs");
if (!picker || !what || !host) throw new Error("The gallery is missing a part.");

for (const fixture of FIXTURES) {
  const option = document.createElement("option");
  option.value = fixture.name;
  option.textContent = fixture.name;
  picker.append(option);
}

/** The frame for one design, and the head above it naming what it is. */
function panel(id: string, name: string, era: string, description: string): HTMLElement {
  const block = document.createElement("section");
  block.className = "design";

  const head = document.createElement("div");
  head.className = "design-head";
  const title = document.createElement("span");
  title.className = "design-name";
  title.textContent = name;
  const when = document.createElement("span");
  when.className = "design-era";
  when.textContent = era;
  const open = document.createElement("a");
  open.className = "design-open";
  open.textContent = "open on its own";
  const line = document.createElement("span");
  line.className = "design-what";
  line.textContent = description;
  head.append(title, when, open, line);

  const frame = document.createElement("iframe");
  frame.title = name;
  block.append(head, frame);
  block.dataset.design = id;
  return block;
}

const frames = INSTALLED_DESIGNS.map((design) => {
  const block = panel(
    design.manifest.id,
    design.manifest.name,
    design.manifest.era,
    design.manifest.description,
  );
  host.append(block);
  return block;
});

/** Points every frame at the chosen installation. */
function show(fixtureName: string): void {
  const fixture = FIXTURES.find((candidate) => candidate.name === fixtureName);
  what.textContent = fixture?.what ?? "";
  for (const block of frames) {
    const address = `./design.html?design=${encodeURIComponent(block.dataset.design ?? "")}&fixture=${encodeURIComponent(fixtureName)}`;
    const frame = block.querySelector("iframe");
    const link = block.querySelector("a");
    if (frame) frame.src = address;
    if (link) link.href = address;
  }
}

picker.addEventListener("change", () => show(picker.value));
show(FIXTURES[0]!.name);
