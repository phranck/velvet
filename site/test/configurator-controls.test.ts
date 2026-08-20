import assert from "node:assert/strict";
import { test } from "bun:test";

import { shuffledPlaces, sliderStep } from "../src/configurator/controls.js";
import { checkThemeSettings } from "@velvet/contracts";

/**
 * A repeatable source of numbers in [0, 1).
 *
 * The scattering takes its two offsets from chance, so measuring what it
 * produces means deciding what chance hands it. This is a linear congruential
 * generator with the constants from Numerical Recipes, which is enough to stand
 * in for `Math.random` here and is the same sequence on every machine.
 *
 * @param seed - Where the sequence starts.
 * @returns A function handing back the next number each time it is called.
 */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * How close together the two nearest places in an arrangement sit.
 *
 * @param places - An arrangement, as the control hands it over.
 * @returns The distance between the closest pair, in units of the square.
 */
function nearestPair(places: string): number {
  const points = places.split(";").map((place) => {
    const [across, down] = place.split(" ");
    return { across: Number.parseInt(across, 10), down: Number.parseInt(down, 10) };
  });
  let nearest = Number.POSITIVE_INFINITY;
  for (let one = 0; one < points.length; one++) {
    for (let other = one + 1; other < points.length; other++) {
      const across = points[one].across - points[other].across;
      const down = points[one].down - points[other].down;
      nearest = Math.min(nearest, Math.hypot(across, down) / 100);
    }
  }
  return nearest;
}

test("hands back one place per property, as whole percentages", () => {
  const places = shuffledPlaces(6, sequence(1));
  const each = places.split(";");
  assert.equal(each.length, 6);
  for (const place of each) {
    assert.match(place, /^\d{1,3}% \d{1,3}%$/u);
  }
});

test("gives a value the configuration is allowed to carry", () => {
  // The same check the build runs before it publishes a page, so an arrangement
  // this control produced cannot be one the build then refuses.
  const feature = {
    key: "backdropPlaces",
    type: "arrangement" as const,
    properties: ["--one", "--two", "--three"],
    default: "10% 10%;50% 50%;90% 90%",
  };
  for (let seed = 1; seed <= 50; seed++) {
    const value = shuffledPlaces(3, sequence(seed));
    assert.deepEqual(
      checkThemeSettings({ backdropPlaces: value }, [feature]),
      [],
      `the build refuses ${value}`,
    );
  }
});

test("the same two offsets give the same sky, and different ones do not", () => {
  assert.equal(shuffledPlaces(6, sequence(7)), shuffledPlaces(6, sequence(7)));
  assert.notEqual(shuffledPlaces(6, sequence(7)), shuffledPlaces(6, sequence(8)));
});

test("keeps the clouds apart, which is what chance alone does not", () => {
  // The whole reason for stepping by the plastic constant. Six points taken
  // from chance clump often enough that clumping is the ordinary result, and
  // three clouds in one corner is not a sky somebody shuffled to. Measured as
  // the distance between the closest pair, averaged over the same offsets.
  const runs = 2_000;
  let scattered = 0;
  let byChance = 0;
  for (let seed = 1; seed <= runs; seed++) {
    scattered += nearestPair(shuffledPlaces(6, sequence(seed)));

    const random = sequence(seed);
    const places = Array.from(
      { length: 6 },
      () =>
        `${Math.round(random() * 100)}% ${Math.round(random() * 100)}%`,
    ).join(";");
    byChance += nearestPair(places);
  }

  assert.ok(
    scattered / runs > 0.25,
    `the nearest pair averages ${(scattered / runs).toFixed(3)}, which is close`,
  );
  assert.ok(
    scattered / runs > (byChance / runs) * 1.5,
    `scattered ${(scattered / runs).toFixed(3)} against ${(byChance / runs).toFixed(3)} by chance`,
  );
});

test("a slider over a small range moves a unit at a time", () => {
  assert.equal(sliderStep(0, 10), 1);
  assert.equal(sliderStep(3, 12), 1);
  assert.equal(sliderStep(0, 100), 1);
});

test("a slider over a wide range moves in hundredths of what it spans", () => {
  assert.equal(sliderStep(0, 1_000), 10);
  assert.equal(sliderStep(400, 1_600), 12);
  // Rounded, so a span that is not a multiple of a hundred still moves in whole
  // numbers: a slider handing back 10.5 would offer a value between its notches.
  assert.equal(sliderStep(0, 250), 3);
});
