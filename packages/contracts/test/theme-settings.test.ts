import assert from "node:assert/strict";
import { test } from "bun:test";

import { checkThemeSettings, type ThemeFeatureShape } from "../src/index.js";

/**
 * What an operator set on a theme, held against what that theme offers.
 *
 * The schema cannot do this: which keys exist is the named theme's answer, and
 * the name is only known once the configuration has been read. Everything below
 * is therefore the one place a wrong setting is caught before it reaches a page.
 */
const FEATURES: ThemeFeatureShape[] = [
  { key: "accent", type: "colour" },
  { key: "chartWash", type: "switch" },
  {
    key: "corners",
    type: "choice",
    choices: [
      { value: "rounded", label: "Rounded" },
      { value: "square", label: "Square" },
    ],
  },
  { key: "gridLines", type: "number", minimum: 1, maximum: 6 },
];

test("accepts a value of every kind the theme offers", () => {
  assert.deepEqual(
    checkThemeSettings(
      {
        accent: "#6366F1",
        chartWash: false,
        corners: "square",
        gridLines: 5,
      },
      FEATURES,
    ),
    [],
  );
});

test("accepts a configuration that sets nothing", () => {
  assert.deepEqual(checkThemeSettings({}, FEATURES), []);
});

test("names what the theme offers when a setting is not one of them", () => {
  const problems = checkThemeSettings({ accentColour: "#6366f1" }, FEATURES);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.key, "accentColour");
  assert.match(problems[0]?.message ?? "", /no setting called "accentColour"/);
  assert.match(problems[0]?.message ?? "", /accent, chartWash, corners, gridLines/);
});

test("says so plainly where the theme offers nothing at all", () => {
  const problems = checkThemeSettings({ accent: "#6366f1" }, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0]?.message ?? "", /offers nothing to set/);
});

test("refuses a value the feature cannot take", () => {
  const cases: Array<[Record<string, string | number | boolean>, RegExp]> = [
    [{ accent: "indigo" }, /must be a colour/],
    [{ accent: 6366 }, /must be a colour/],
    [{ chartWash: "yes" }, /must be true or false/],
    [{ corners: "bevelled" }, /must be one of rounded, square/],
    [{ gridLines: "many" }, /must be a number/],
    [{ gridLines: 9 }, /must lie between 1 and 6, not 9/],
    [{ gridLines: 0 }, /must lie between 1 and 6, not 0/],
  ];
  for (const [settings, expected] of cases) {
    const problems = checkThemeSettings(settings, FEATURES);
    assert.equal(problems.length, 1, JSON.stringify(settings));
    assert.match(problems[0]?.message ?? "", expected, JSON.stringify(settings));
  }
});

test("reports every fault at once rather than the first", () => {
  const problems = checkThemeSettings(
    { accent: "indigo", corners: "bevelled", nothing: true },
    FEATURES,
  );
  assert.deepEqual(
    problems.map(({ key }) => key).sort(),
    ["accent", "corners", "nothing"],
  );
});
