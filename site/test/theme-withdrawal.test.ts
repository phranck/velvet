import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  leavingIsFinal,
  themesOfferedTo,
  type Theme,
} from "../src/lib/themes/catalogue.js";

/**
 * What withdrawing a theme means for the installations that meet it.
 *
 * Nothing that ships is withdrawn today, so none of this runs against the real
 * catalogue and none of it would be noticed going wrong. The themes below are
 * therefore made up rather than read: the point is the rule, and the rule has to
 * hold before the first theme is retired rather than after.
 */

/**
 * A theme with only the fields these two rules read.
 *
 * @param id - Its directory name.
 * @param state - Whether it is still offered.
 * @returns The theme, filled out enough to be sorted and named.
 */
function theme(id: string, state: "offered" | "withdrawn"): Theme {
  return {
    id,
    name: id,
    description: `${id}, for a test`,
    era: "today",
    version: "1.0.0",
    order: 1,
    state,
    dataVersion: 1,
    root: `.${id}-page`,
    entries: {
      template: "template.ts",
      styles: "theme.css",
      script: "script.ts",
    },
    layouts: ["grouped"],
    readings: "overlay",
    card: {
      backgroundStart: "#000000",
      backgroundEnd: "#000000",
      surface: "#111111",
      operational: "#00ff00",
      degraded: "#ffaa00",
      outage: "#ff0000",
      noData: "#222222",
      ipv4: "#00aaff",
      ipv6: "#aa00ff",
      textPrimary: "#ffffff",
      textSecondary: "#cccccc",
      textTertiary: "#999999",
      clouds: false,
    },
    features: [],
    picture: `${id}.png`,
  };
}

const CATALOGUE = [
  theme("velvet", "offered"),
  theme("retired", "withdrawn"),
  theme("2049", "offered"),
];

test("a withdrawn theme is offered to nobody who is not already in it", () => {
  for (const published of [null, "velvet", "2049", "no-such-theme"]) {
    assert.deepEqual(
      themesOfferedTo(published, CATALOGUE).map((offered) => offered.id),
      ["velvet", "2049"],
      `published in ${published ?? "nothing"}`,
    );
  }
});

test("the installation running it sees it, first and exactly once", () => {
  assert.deepEqual(
    themesOfferedTo("retired", CATALOGUE).map((offered) => offered.id),
    ["retired", "velvet", "2049"],
  );
});

test("leaving a withdrawn theme is final, and leaving any other is not", () => {
  assert.equal(leavingIsFinal("retired", "retired", CATALOGUE), true);
  assert.equal(leavingIsFinal("velvet", "velvet", CATALOGUE), false);
});

test("having already moved off it, there is nothing left to warn about", () => {
  // The decision was taken when the choice moved. Asking again would ask about
  // returning to a theme that is not on offer, which is not what is happening.
  assert.equal(leavingIsFinal("retired", "velvet", CATALOGUE), false);
  assert.equal(leavingIsFinal(null, "velvet", CATALOGUE), false);
});
