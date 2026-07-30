import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

import { parseConfiguratorYaml } from "../src/configurator/configuration.js";

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
      const request = JSON.parse(route.request().postData() ?? "null") as {
        configuration?: { statusPage?: { customDomain?: string } };
      };
      assert.equal(
        request.configuration?.statusPage?.customDomain,
        "status.example.com",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: [
          JSON.stringify({ type: "progress", stage: "creating-repository" }),
          JSON.stringify({ type: "progress", stage: "waiting-for-deployment" }),
          JSON.stringify({
            type: "success",
            installationUrl: "https://status.example.com/",
            repositoryUrl: "https://github.com/velvet-user/status",
          }),
        ].join("\n"),
      });
    });

    await page.goto(`http://127.0.0.1:${address.port}/onboarding.html`);
    assert.equal(
      await page.locator("body").evaluate((element) =>
        getComputedStyle(element).backgroundAttachment,
      ),
      "fixed, fixed, fixed",
    );
    assert.equal(
      await page.locator("body").evaluate((element) =>
        getComputedStyle(element).backgroundRepeat,
      ),
      "no-repeat, no-repeat, no-repeat",
    );
    assert.equal(
      await page.locator("form").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.equal(
      await page.locator(".steps button").first().evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.equal(await page.locator(".topbar").count(), 0);
    assert.equal(await page.locator(".page-footer").count(), 0);
    assert.equal(
      await page.locator("[data-onboarding-palette-color]").count(),
      9,
    );
    assert.equal(
      await page.locator(".intro").evaluate((element) =>
        getComputedStyle(element).textAlign,
      ),
      "center",
    );
    assert.equal(
      await page.locator(".intro > p").evaluate((element) =>
        element.getBoundingClientRect().width ===
        element.parentElement?.getBoundingClientRect().width,
      ),
      true,
    );
    assert.match(
      await page.locator(".onboarding-shell").evaluate((element) =>
        getComputedStyle(element).fontFamily,
      ),
      /Barlow/,
    );
    assert.match(
      await page.locator(".section-heading h2").first().evaluate((element) =>
        getComputedStyle(element).fontFamily,
      ),
      /Barlow Condensed/,
    );
    assert.equal(
      await page.locator(".form-actions").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    const ownerInput = page.getByLabel("Repository owner");
    assert.equal(
      await ownerInput.evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.notEqual(
      await ownerInput.evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
      await page.locator("form").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    );
    assert.deepEqual(
      await Promise.all([
        ownerInput.evaluate((element) => element.getBoundingClientRect().height),
        page.getByRole("button", { name: "Continue" }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
        page.locator(".steps button").first().evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
      ]),
      [40, 40, 40],
    );
    assert.equal(
      await page.getByRole("button", { name: "Continue" }).evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "16px",
    );
    assert.equal(
      await page.locator(".steps button").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "16px",
    );
    assert.equal(
      await page.getByLabel("Repository owner").locator("xpath=preceding-sibling::span")
        .evaluate((element) => getComputedStyle(element).fontSize),
      "16px",
    );
    assert.equal(
      await page.locator(".field-hint").evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "15px",
    );
    assert.equal(
      await page.locator(".section-heading p").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "15px",
    );
    assert.deepEqual(
      await page.locator(".onboarding-brand-block").evaluate((element) => {
        const widths = [
          element.querySelector<HTMLElement>(".velvet-wordmark"),
          element.querySelector<HTMLElement>(".onboarding-brand > span"),
          element.querySelector<HTMLElement>(".onboarding-palette"),
        ].map((child) => Math.round(child?.getBoundingClientRect().width ?? 0));
        return widths;
      }),
      [270, 270, 270],
    );
    assert.equal(
      await page.locator(".onboarding-brand .velvet-wordmark").evaluate(
        (element) => getComputedStyle(element).textAlign,
      ),
      "center",
    );
    await page.getByLabel("Repository owner").fill("velvet-user");
    await page.getByLabel("Repository name").fill("status");
    await page.getByLabel("Status page name").fill("My Status");
    const customDomainInput = page.getByLabel("Custom domain (optional)");
    await customDomainInput.fill("https://status.example.com/path");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText(
      "Enter a hostname without https://, a path, port, credentials, or wildcard.",
    ).waitFor();
    assert.equal(
      await page.locator(".field-error").evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "15px",
    );
    assert.equal(setupCalls, 0);
    assert.equal(
      await page.locator('.steps button[aria-current="step"]').textContent(),
      "1 Status page",
    );
    await customDomainInput.fill("STATUS.Example.COM");
    assert.match(
      await page.getByText(/CNAME/).textContent() ?? "",
      /velvet-user\.github\.io/,
    );
    assert.equal(
      await page.locator(".dns-guidance").evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "15px",
    );
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Service name").fill("Website");
    await page.getByLabel("Website URL").fill("https://example.com");
    const setupIconPicker = page.locator("[data-service-icon-picker]").first();
    const setupIconTrigger = setupIconPicker.getByRole("button", {
      name: "Service icon: Automatic",
    });
    assert.equal(await setupIconTrigger.getAttribute("aria-expanded"), "false");
    assert.equal(
      await setupIconTrigger.evaluate((element) => element.getBoundingClientRect().height),
      40,
    );
    await setupIconTrigger.click();
    const setupIconOptions = setupIconPicker.getByRole("option");
    assert.equal(await setupIconOptions.count(), 22);
    assert.equal(await setupIconOptions.locator("i:first-child").count(), 22);
    assert.equal(await setupIconOptions.locator("span").count(), 0);
    assert.equal(await setupIconOptions.first().getAttribute("aria-label"), "Automatic");
    assert.equal(
      await setupIconPicker.getByRole("listbox").evaluate((element) =>
        getComputedStyle(element).position,
      ),
      "absolute",
    );
    assert.equal(
      await setupIconPicker.getByRole("listbox").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
      6,
    );
    await setupIconPicker.getByRole("option", { name: "Storage" }).click();
    assert.equal(
      await setupIconPicker.getByRole("button", { name: "Service icon: Storage" })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await setupIconPicker.getByRole("button", { name: "Service icon: Storage" })
        .locator(".ph-hard-drives").count(),
      1,
    );
    assert.equal(
      await page.locator(".service-editor").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.equal(
      await page.locator(".service-editor label > span").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "16px",
    );
    assert.equal(
      await page.locator("details").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.deepEqual(
      await Promise.all([
        page.getByRole("button", { name: "Add another service" }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
        page.getByRole("button", { name: "Back" }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
        page.getByRole("button", { name: "Continue" }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
      ]),
      [40, 40, 40],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Continue" }).click();

    if (process.env.VELVET_ONBOARDING_SCREENSHOT) {
      await page.screenshot({
        path: process.env.VELVET_ONBOARDING_SCREENSHOT,
        fullPage: true,
      });
    }

    const themeRadios = page.locator('input[name="system-theme"]');
    assert.equal(await themeRadios.count(), 4);
    assert.deepEqual(
      await Promise.all([
        page.locator("[data-theme-card-group] legend").evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        page.locator("[data-theme-card-group] > p").evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        page.locator("[data-theme-card-option] strong").first().evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
      ]),
      ["16px", "15px", "16px"],
    );
    assert.equal(
      await page.locator("[data-theme-card-option]").first().evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    await themeRadios.first().focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await themeRadios.nth(1).isChecked(), true);
    await page.getByRole("button", { name: "Continue" }).click();
    assert.equal(
      await page.locator(".review-grid").getByText("status.example.com").count(),
      1,
    );
    assert.match(
      await page.getByText(/DNS changes happen outside Velvet/).textContent() ?? "",
      /may take time to propagate/,
    );
    assert.equal(
      await page.locator(".review-grid > div").first().evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.deepEqual(
      await Promise.all([
        page.locator(".review-grid span").first().evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        page.locator(".review-grid strong").first().evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        page.locator(".github-permission-note").evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
      ]),
      ["15px", "16px", "15px"],
    );
    await page.goto(
      `http://127.0.0.1:${address.port}/onboarding.html?github=connected`,
    );

    await page.getByText(
      "Velvet is published. Your custom domain will work after its DNS records have propagated.",
    ).waitFor();
    assert.equal(
      await page.locator(".deployment-progress").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.equal(
      await page.locator(".deployment-progress li").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "16px",
    );
    assert.equal(sessionCalls, 1);
    assert.equal(setupCalls, 1);
    assert.equal(
      await page.getByRole("link", { name: "Open your status page" }).getAttribute("href"),
      "https://status.example.com/",
    );
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.ok(dimensions.document <= dimensions.viewport);
    assert.equal(
      await page.locator("[data-service-icon-picker] [role='listbox']").first()
        .evaluate((element) =>
        getComputedStyle(element).transitionDuration,
      ),
      "0s",
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true,
        value: undefined,
      });
    });
    await page.goto(`http://127.0.0.1:${address.port}/configurator.html`);
    assert.equal(
      await page.locator(".control-panel").evaluate((element) =>
        element.getBoundingClientRect().width,
      ),
      440,
    );
    const cloudyAutumn = page.locator(
      '[data-theme-card-option="cloudy-autumn"]',
    );
    await cloudyAutumn.click();
    assert.equal(await cloudyAutumn.locator("input").isChecked(), true);
    const websiteIcons = page.locator("[data-service-icon-picker]").first();
    await websiteIcons.getByRole("button", { name: "Service icon: Automatic" }).click();
    assert.deepEqual(
      await websiteIcons.getByRole("listbox").evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          columns: style.gridTemplateColumns.split(" ").length,
          rows: style.gridTemplateRows.split(" ").length,
        };
      }),
      { columns: 11, rows: 2 },
    );
    await websiteIcons.getByRole("option", { name: "Storage" }).click();
    assert.equal(
      await page.locator("button.summary").first().locator(".ph-hard-drives").count(),
      1,
    );

    const importedYaml = `schemaVersion: 1
repository:
  owner: velvet-user
  name: status
statusPage:
  name: Example Status
  customDomain: status.example.com
  icons:
    api: ph-brackets-curly
services:
  - name: API
    checks:
      - id: primary
        name: Primary API
        url: https://api.example.com/health
        method: GET
        expectedStatusCodes: [200, 204]
        maxRedirects: 2
        timeoutMs: 3500
        headers:
          - name: Authorization
            secret: API_HEALTH_TOKEN
        jsonAssertions:
          - path: /healthy
            equals: true
      - id: fallback
        name: Fallback API
        url: https://fallback.example.com/health
  - name: Website
    url: https://example.com
incidents:
  failureThreshold: 3
history:
  retentionDays: 180
`;
    await page.locator("#yaml-file").setInputFiles({
      name: "velvet.yml",
      mimeType: "application/yaml",
      buffer: Buffer.from(importedYaml),
    });
    await page.getByText("velvet.yml opened. Unrelated YAML fields will be preserved.")
      .waitFor();

    const serviceEditors = page.locator("[data-service-editor]");
    assert.equal(await serviceEditors.count(), 2);
    const firstService = serviceEditors.first();
    assert.equal(await firstService.getByLabel("Service name").inputValue(), "API");
    assert.equal(await firstService.getByLabel("Method").inputValue(), "GET");
    assert.equal(
      await firstService.getByLabel("Healthy status codes").inputValue(),
      "200, 204",
    );
    assert.equal(await firstService.getByLabel("Timeout in ms").inputValue(), "3500");
    assert.equal(await firstService.getByLabel("Maximum redirects").inputValue(), "2");
    assert.equal(await firstService.getByLabel("Header name").inputValue(), "Authorization");
    assert.equal(
      await firstService.getByLabel("Secret name").inputValue(),
      "API_HEALTH_TOKEN",
    );
    assert.equal(await firstService.getByLabel("JSON pointer").inputValue(), "/healthy");
    assert.equal(await firstService.getByLabel("Expected value").inputValue(), "true");
    assert.match(
      await page.locator(".preserved-checks").textContent() ?? "",
      /1\s+additional check is\s+kept unchanged/,
    );

    await firstService.getByLabel("Service name").fill("Core API");
    await serviceEditors.nth(1).getByRole("button", { name: "Remove service 2" }).click();
    assert.equal(await serviceEditors.count(), 1);
    assert.equal(await page.getByRole("button", { name: "Remove service 1" }).count(), 0);
    await page.getByRole("button", { name: "Add another service" }).click();
    assert.equal(await serviceEditors.count(), 2);
    const addedService = serviceEditors.nth(1);
    await addedService.getByLabel("Service name").fill("Storage");
    await addedService.getByLabel("Website URL").fill("https://storage.example.com");
    const addedIconPicker = addedService.locator("[data-service-icon-picker]");
    await addedIconPicker.getByRole("button", { name: "Service icon: Automatic" }).click();
    await addedIconPicker.getByRole("option", { name: "Storage" }).click();
    assert.deepEqual(
      await page.locator("button.summary .name").allTextContents(),
      ["Core API", "Storage"],
    );

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.locator(".control-panel").evaluate((element) =>
        element.getBoundingClientRect().width,
      ),
      390,
    );
    assert.equal(
      await firstService.locator(".form-grid.two-columns").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
      1,
    );
    await page.setViewportSize({ width: 1280, height: 800 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Config" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    assert.ok(downloadPath);
    const saved = parseConfiguratorYaml(await readFile(downloadPath, "utf8"));
    const repository = saved.document.repository as Record<string, unknown>;
    const statusPage = saved.document.statusPage as Record<string, unknown>;
    const incidents = saved.document.incidents as Record<string, unknown>;
    const history = saved.document.history as Record<string, unknown>;
    const savedServices = saved.document.services as Array<Record<string, unknown>>;
    assert.deepEqual(repository, { owner: "velvet-user", name: "status" });
    assert.equal(statusPage.customDomain, "status.example.com");
    assert.equal(incidents.failureThreshold, 3);
    assert.equal(history.retentionDays, 180);
    assert.deepEqual(
      savedServices.map(({ id, name }) => ({ id, name })),
      [
        { id: "core-api", name: "Core API" },
        { id: "storage", name: "Storage" },
      ],
    );
    const primaryChecks = savedServices[0]?.checks as Array<Record<string, unknown>>;
    assert.equal(primaryChecks.length, 2);
    assert.deepEqual(primaryChecks[0]?.expectedStatusCodes, [200, 204]);
    assert.equal(primaryChecks[0]?.maxRedirects, 2);
    assert.equal(primaryChecks[0]?.timeoutMs, 3500);
    assert.deepEqual(primaryChecks[0]?.headers, [
      { name: "Authorization", secret: "API_HEALTH_TOKEN" },
    ]);
    assert.deepEqual(primaryChecks[0]?.jsonAssertions, [
      { path: "/healthy", equals: true },
    ]);
    assert.equal(primaryChecks[1]?.id, "fallback");
    assert.deepEqual(statusPage.icons, {
      "core-api": "ph-brackets-curly",
      storage: "ph-hard-drives",
    });

    const motionContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "no-preference",
    });
    const motionPage = await motionContext.newPage();
    await motionPage.route("https://phranck.github.io/velvet-themes/index.json", (route) =>
      route.abort(),
    );
    await motionPage.goto(`http://127.0.0.1:${address.port}/onboarding.html`);
    await motionPage.getByLabel("Repository owner").fill("velvet-user");
    await motionPage.getByLabel("Repository name").fill("status");
    await motionPage.getByLabel("Status page name").fill("My Status");
    await motionPage.getByRole("button", { name: "Continue" }).click();
    const advancedDetails = motionPage.locator("details").first();
    const advancedContent = advancedDetails.locator("[data-disclosure-content]");
    await advancedDetails.locator("summary").click();
    assert.equal(await advancedDetails.getAttribute("open"), "");
    assert.deepEqual(
      await advancedContent.evaluate((element) =>
        element.getAnimations().map((animation) => ({
          duration: animation.effect?.getTiming().duration,
          easing: animation.effect?.getTiming().easing,
        })),
      ),
      [{ duration: 200, easing: "ease-in-out" }],
    );
    const motionIconPicker = motionPage.locator("[data-service-icon-picker]").first();
    const motionIconListbox = motionIconPicker.getByRole("listbox");
    await motionIconPicker.getByRole("button", { name: "Service icon: Automatic" }).click();
    assert.match(
      await motionIconListbox.evaluate((element) =>
        getComputedStyle(element).transitionDuration,
      ),
      /0\.2s/,
    );
    await motionPage.keyboard.press("Escape");
    const motionIconTrigger = motionIconPicker.getByRole("button", {
      name: "Service icon: Automatic",
    });
    await motionIconTrigger.focus();
    await motionPage.keyboard.press("End");
    assert.equal(
      await motionIconPicker.getByRole("option", { name: "Calendar" }).evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    await motionPage.keyboard.press("ArrowUp");
    assert.equal(
      await motionIconPicker.getByRole("option", { name: "Shop" }).evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    await motionPage.keyboard.press("ArrowDown");
    assert.equal(
      await motionIconPicker.getByRole("option", { name: "Calendar" }).evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    await motionPage.keyboard.press("Enter");
    assert.equal(
      await motionIconPicker.getByRole("button", { name: "Service icon: Calendar" })
        .getAttribute("aria-expanded"),
      "false",
    );
    await motionContext.close();
  } finally {
    await browser.close();
    await server.close();
  }
}, 30_000);
