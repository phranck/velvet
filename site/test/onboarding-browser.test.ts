import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

test("completes onboarding with keyboard, narrow viewport, and reduced motion", async () => {
  const server = await createServer({
    root: resolve(import.meta.dirname, ".."),
    configFile: false,
    logLevel: "silent",
    plugins: [svelte()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Missing Vite port.");

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      hasTouch: true,
    });
    const page = await context.newPage();
    let sessionCalls = 0;
    let setupCalls = 0;
    await page.route("https://phranck.github.io/velvet-themes/index.json", (route) =>
      route.abort(),
    );
    await page.route("**/api/session", async (route) => {
      sessionCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          csrfToken: "S".repeat(43),
        }),
      });
    });
    await page.route("**/api/setup", async (route) => {
      setupCalls += 1;
      assert.equal(
        await route.request().headerValue("x-velvet-csrf"),
        "S".repeat(43),
      );
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: [
          JSON.stringify({ type: "progress", stage: "creating-repository" }),
          JSON.stringify({ type: "progress", stage: "waiting-for-deployment" }),
          JSON.stringify({
            type: "success",
            installationUrl: "https://velvet-user.github.io/status/",
            repositoryUrl: "https://github.com/velvet-user/status",
          }),
        ].join("\n"),
      });
    });

    await page.goto(`http://127.0.0.1:${address.port}/onboarding.html`);
    await page.getByLabel("Repository owner").fill("velvet-user");
    await page.getByLabel("Repository name").fill("status");
    await page.getByLabel("Status page name").fill("My Status");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Service name").fill("Website");
    await page.getByLabel("Website URL").fill("https://example.com");
    await page.getByTitle("Storage").click();
    assert.equal(await page.getByTitle("Storage").locator("input").isChecked(), true);
    await page.getByRole("button", { name: "Continue" }).click();

    if (process.env.VELVET_ONBOARDING_SCREENSHOT) {
      await page.screenshot({
        path: process.env.VELVET_ONBOARDING_SCREENSHOT,
        fullPage: true,
      });
    }

    const themeRadios = page.locator('input[name="system-theme"]');
    assert.equal(await themeRadios.count(), 4);
    await themeRadios.first().focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await themeRadios.nth(1).isChecked(), true);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.goto(
      `http://127.0.0.1:${address.port}/onboarding.html?github=connected`,
    );

    await page.getByText("Your Velvet status page is ready.").waitFor();
    assert.equal(sessionCalls, 1);
    assert.equal(setupCalls, 1);
    assert.equal(
      await page.getByRole("link", { name: "Open your status page" }).getAttribute("href"),
      "https://velvet-user.github.io/status/",
    );
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.ok(dimensions.document <= dimensions.viewport);
    assert.equal(
      await page.getByTitle("Storage").evaluate((element) =>
        getComputedStyle(element).transitionDuration,
      ),
      "0s",
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${address.port}/configurator.html`);
    const cloudyAutumn = page.locator(
      '[data-theme-card-option="cloudy-autumn"]',
    );
    await cloudyAutumn.click();
    assert.equal(await cloudyAutumn.locator("input").isChecked(), true);
    const websiteIcons = page.locator("[data-service-icon-picker]").first();
    await websiteIcons.getByTitle("Storage").click();
    assert.equal(
      await page.locator("button.summary").first().locator(".ph-hard-drives").count(),
      1,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}, 30_000);
