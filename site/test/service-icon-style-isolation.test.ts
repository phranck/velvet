import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";
import { chromium } from "playwright";

/**
 * Launching a browser takes far longer than a unit test, and how much longer
 * depends on what else the machine is doing. The default five seconds covered
 * it until the suite grew, at which point the test began failing in CI for
 * being slow rather than for finding a defect.
 */
const BROWSER_TIMEOUT_MS = 120_000;

test("keeps affected UI styles safe when component CSS loses its scope", async () => {
  const siteRoot = resolve(import.meta.dirname, "..");
  const iconOptionSource = await readFile(
    resolve(siteRoot, "src/components/service-icon-picker/ServiceIconOption.svelte"),
    "utf8",
  );
  const reviewItemSource = await readFile(
    resolve(siteRoot, "src/components/review-list/ReviewListItem.svelte"),
    "utf8",
  );
  const toolBrandSource = await readFile(
    resolve(siteRoot, "src/components/VelvetToolBrand.svelte"),
    "utf8",
  );
  const iconOptionStyles = iconOptionSource.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  const reviewItemStyles = reviewItemSource.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(iconOptionStyles, "Missing ServiceIconOption styles.");
  assert.ok(reviewItemStyles, "Missing ReviewListItem styles.");
  assert.deepEqual(
    [...iconOptionStyles.matchAll(/(?:^|})\s*(button|svg|i)(?=[:\s{])/gm)].map(
      (match) => match[1],
    ),
    [],
    "ServiceIconOption must not expose broad element selectors when its CSS loses scope.",
  );
  assert.deepEqual(
    [...reviewItemStyles.matchAll(/(?:^|})\s*(svg|i|dt|dd)\s*\{/gm)].map(
      (match) => match[1],
    ),
    [],
    "ReviewListItem must not expose broad element selectors when its CSS loses scope.",
  );
  assert.doesNotMatch(
    toolBrandSource,
    /:global\(/,
    "VelvetToolBrand must not depend on Svelte-only selectors in a leaked stylesheet.",
  );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(`
      <style>
        .plot-link { display: block; width: 660px; }
        .plot { display: block; width: 100%; height: auto; }
        [data-squircle-step] { position: relative; width: 88px; height: 88px; }
        [data-squircle-step] > svg { display: block; width: 100%; height: 100%; }
        ${iconOptionStyles}
        ${reviewItemStyles}
      </style>
      <a class="plot-link"><svg class="plot" viewBox="0 0 640 148"></svg></a>
      <button type="button" data-squircle-step>
        <svg viewBox="0 0 88 88"></svg>
      </button>
    `);
    const isolatedPlot = page.locator(".plot").first();
    const configuratorPlotIsContained = await isolatedPlot.evaluate((plot) => {
      const plotRect = plot.getBoundingClientRect();
      const linkRect = plot.parentElement?.getBoundingClientRect();
      return Boolean(
        linkRect &&
          getComputedStyle(plot).position !== "absolute" &&
          linkRect.height > 0 &&
          plotRect.left >= linkRect.left - 1 &&
          plotRect.right <= linkRect.right + 1,
      );
    });

    const stepShape = page.locator("[data-squircle-step] svg").first();
    const onboardingStepIsContained = await stepShape.evaluate((shape) => {
      const shapeRect = shape.getBoundingClientRect();
      const buttonRect = shape.closest("button")?.getBoundingClientRect();
      return Boolean(
        buttonRect &&
          shapeRect.left >= buttonRect.left - 1 &&
          shapeRect.top >= buttonRect.top - 1 &&
          shapeRect.right <= buttonRect.right + 1 &&
          shapeRect.bottom <= buttonRect.bottom + 1,
      );
    });

    assert.deepEqual(
      { configuratorPlotIsContained, onboardingStepIsContained },
      { configuratorPlotIsContained: true, onboardingStepIsContained: true },
    );
  } finally {
    await browser.close();
  }
}, BROWSER_TIMEOUT_MS);
