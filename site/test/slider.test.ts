import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

async function source(path: string): Promise<string> {
  return readFile(resolve(import.meta.dirname, path), "utf8").catch(() => "");
}

test("maps discrete and continuous values through one slider model", async () => {
  const modelModule = await import("../src/configurator/slider/model.js").catch(
    () => null,
  );
  assert.ok(modelModule, "the shared slider model must exist");

  const discrete = modelModule.createSliderModel({
    value: 920,
    options: [
      { value: 640, label: "Compact", output: "640 px" },
      { value: 760, label: "Default", output: "760 px" },
      { value: 920, label: "Wide", output: "920 px" },
      { value: 1080, label: "Maximum", output: "1080 px" },
    ],
  });
  assert.deepEqual(discrete.positions, [0, 1 / 3, 2 / 3, 1]);
  assert.equal(discrete.inputValue, 2);
  assert.equal(discrete.output, "920 px");
  assert.equal(discrete.ariaValueText, "Wide, 920 px");
  assert.equal(discrete.valueFromInput("3"), 1080);

  const continuous = modelModule.createSliderModel({
    value: 14,
    min: 0,
    max: 32,
    step: 1,
    output: "14 px",
  });
  assert.equal(continuous.ratio, 14 / 32);
  assert.equal(continuous.inputValue, 14);
  assert.equal(continuous.output, "14 px");
  assert.equal(continuous.valueFromInput("18"), 18);
});

test("exposes compound primitives with shared colors and optional tickmarks", async () => {
  const [index, root, control, labels] = await Promise.all([
    source("../src/configurator/slider/index.ts"),
    source("../src/configurator/slider/SliderRoot.svelte"),
    source("../src/configurator/slider/SliderControl.svelte"),
    source("../src/configurator/slider/SliderLabels.svelte"),
  ]);

  assert.match(index, /Root/);
  assert.match(index, /Header/);
  assert.match(index, /Control/);
  assert.match(index, /Labels/);
  assert.match(root, /setContext/);
  assert.match(root, /--slider-active/);
  assert.match(root, /--slider-inactive/);
  assert.match(root, /--slider-thumb/);
  assert.match(root, /--slider-inner-ring/);
  assert.match(root, /--slider-outer-ring/);
  assert.match(control, /tickmarks/);
  assert.match(control, /data-slider-knob/);
  assert.match(control, /data-slider-tick/);
  assert.match(labels, /context\.model\.positions/);
  assert.match(labels, /translateX\(-50%\)/);
  assert.match(labels, /span:first-child[\s\S]*transform:\s*translateX\(0\)/);
  assert.match(labels, /span:last-child[\s\S]*transform:\s*translateX\(-100%\)/);
});

test("uses the compound slider for every configurator range input", async () => {
  const configurator = await source("../src/configurator/Configurator.svelte");

  assert.match(configurator, /import \* as Slider from "\.\/slider"/);
  assert.equal(configurator.match(/<Slider\.Root/g)?.length, 4);
  assert.equal(configurator.match(/<Slider\.Control tickmarks/g)?.length, 2);
  assert.equal(configurator.match(/<Slider\.Labels/g)?.length, 2);
  assert.match(
    configurator,
    /label:\s*\["Min",\s*"Default",\s*"Wide",\s*"Max"\]\[index\]/,
  );
  assert.doesNotMatch(configurator, /<SteppedSlider/);
  assert.doesNotMatch(configurator, /type="range"/);
});
