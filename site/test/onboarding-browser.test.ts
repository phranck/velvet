import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

import { SetupProgressStageSchema } from "@velvet/contracts";

import { ONBOARDING_SESSION_STORAGE_KEY } from "../src/onboarding/onboarding-session.js";

import { parseConfiguratorYaml } from "../src/configurator/configuration.js";
import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/**
 * Starting a Vite server, optimising dependencies, launching a browser, and
 * walking the whole onboarding takes far longer than a unit test, and the
 * dependency step grows with the module graph. Thirty seconds no longer
 * covered it once the update components were added, so the test began failing
 * for being slow rather than for finding a defect.
 */
const ONBOARDING_TIMEOUT_MS = 180_000;

test("completes onboarding with keyboard, narrow viewport, and reduced motion", async () => {
  const cache = await createViteTestCache("onboarding-browser");
  const server = await createServer({
    root: resolve(import.meta.dirname, ".."),
    cacheDir: cache.path,
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
    // Confined to the dev server, so no assertion here can be timed by a
    // request to somebody else's machine.
    await refuseOffsiteRequests(page);
    await page.route("**/api/serial", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ next: 7 }),
      });
    });
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
    // Read from the layer that carries the board, which is a fixed element
    // behind the page rather than a background with fixed attachment. Both
    // hold the board still whilst the page scrolls, but a fixed-attachment
    // background is repositioned on every scroll frame, and during a fast
    // scroll that correction lags visibly.
    //
    // Asserted per layer rather than as one string, so adding a background
    // layer cannot fail this for the wrong reason. What matters is that the
    // board does not move and that no layer tiles.
    const backdrop = await page.locator("body").evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return {
        position: style.position,
        repeat: style.backgroundRepeat.split(", "),
        size: style.backgroundSize.split(", "),
        bodyAttachment: getComputedStyle(element).backgroundAttachment.split(", "),
      };
    });
    assert.equal(
      backdrop.position,
      "fixed",
      "the board is not a layer fixed to the viewport",
    );
    assert.equal(
      backdrop.bodyAttachment.includes("fixed"),
      false,
      "a fixed-attachment background is back, which repaints on every scroll frame",
    );
    assert.deepEqual(
      [...new Set(backdrop.repeat)],
      ["no-repeat"],
      "no background layer tiles",
    );
    // Every layer is a gradient painted across the whole fixed element, so each
    // reports its own size rather than being fitted to the window.
    assert.deepEqual(
      [...new Set(backdrop.size)],
      ["auto"],
      "a backdrop layer is being sized to something other than the layer itself",
    );
    assert.equal(await page.locator(".topbar").count(), 0);
    assert.equal(await page.locator("[data-page-footer]").count(), 1);
    assert.deepEqual(
      await page.getByRole("link", { name: "LAYERED" }).evaluate((element) => ({
        href: (element as HTMLAnchorElement).href,
        target: (element as HTMLAnchorElement).target,
        rel: (element as HTMLAnchorElement).rel,
      })),
      {
        href: "https://layered.work/",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    );
    assert.equal(
      await page.locator("[data-rainbow-color]").count(),
      9,
    );
    const stepCard = page.locator("[data-step-card]");
    assert.equal(await stepCard.count(), 1);
    assert.equal(await page.locator("[data-squircle-surface]").count(), 0);
    // Five: the four the visitor fills in, plus Install, which reports the
    // setup rather than collecting anything.
    assert.equal(await stepCard.locator("[data-step-card-body]").count(), 5);
    assert.equal(await stepCard.locator("[data-step-card-footer]").count(), 1);
    assert.equal(await page.locator("[data-step-connector]").count(), 4);
    assert.deepEqual(
      await page.locator("[data-squircle-step]").first().locator("[data-step-active-highlight] path")
        .evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke-width"))),
      ["1", "4"],
    );
    await page.getByLabel("Your GitHub name").fill("velvet-user");
    await page.getByLabel("Repository name").fill("status");
    await page.getByLabel("Status page name").fill("My Status");
    const customDomainInput = page.getByLabel("Custom domain (optional)");
    await customDomainInput.fill("https://status.example.com/path");
    await page.getByRole("button", { name: "Services", exact: true }).click();
    await page.getByText(
      "Enter a hostname without https://, a path, port, credentials, or wildcard.",
    ).waitFor();
    assert.equal(setupCalls, 0);
    assert.equal(
      (await page.locator('.steps button[aria-current="step"]').textContent())
        ?.replace(/\s+/g, " ")
        .trim(),
      "1 Basics",
    );
    await customDomainInput.fill("STATUS.Example.COM");
    // The whole block rather than one word, since the record types now stand in
    // their own elements and matching on `CNAME` alone would be ambiguous.
    assert.match(
      await page.locator(".dns-guidance").textContent() ?? "",
      /velvet-user\.github\.io/,
    );
    // Verification is the one step here with a security consequence, so it is
    // asked for first and carries the warning tone rather than the accent.
    const verification = page.locator(".domain-verification");
    await verification.waitFor();
    assert.match(
      await verification.textContent() ?? "",
      /Verify this domain on GitHub/,
    );
    assert.equal(
      await page.evaluate(() => {
        const notices = [...document.querySelectorAll(".domain-verification, .dns-guidance")];
        return notices[0]?.className.includes("domain-verification") ?? false;
      }),
      true,
      "the verification notice stands before the DNS one",
    );
    await page.getByRole("button", { name: "Services", exact: true }).click();

    await page.getByLabel("Service name").fill("Website");
    // A malformed URL has to stop the step it was typed on. Before this was
    // checked here, the contract rejected it on Publish instead, which put the
    // message two steps away from the field that caused it.
    await page.getByLabel("URL to monitor").fill("example.com");
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    assert.equal(
      await page
        .locator("[data-squircle-step][aria-current='step'] .label")
        .textContent(),
      "Services",
      "a malformed URL keeps the visitor on the Services step",
    );
    assert.equal(
      await page.locator("[data-service-editor] .field-error").textContent(),
      "URL must be an absolute HTTP(S) URL without credentials or a fragment.",
    );
    await page.getByLabel("URL to monitor").fill("https://example.com");
    const setupIconPicker = page.locator("[data-service-icon-picker]").first();
    const setupIconOptions = setupIconPicker.getByRole("option");
    assert.equal(await setupIconOptions.count(), 22);
    assert.equal(await setupIconOptions.locator(":scope > i").count(), 22);
    assert.equal(
      await setupIconOptions.locator("[data-service-icon-squircle]").count(),
      22,
    );
    assert.equal(
      await setupIconOptions.locator(
        ":scope > span:not([data-squircle-surface])",
      ).count(),
      0,
    );
    assert.equal(await setupIconOptions.first().getAttribute("aria-label"), "Automatic");
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '[data-step-card-body]:not([hidden]) [data-service-icon-picker] [role="option"] .selection-outline.outer',
          )
          ?.getAttribute("d")
          ?.startsWith("M") === true,
    );
    await setupIconPicker.getByRole("option", { name: "Storage" }).click();
    assert.equal(
      await setupIconPicker.getByRole("option", { name: "Storage" })
        .getAttribute("aria-selected"),
      "true",
    );
    assert.equal(
      await page.locator(".service-title .ph-hard-drives").count(),
      1,
    );
    await page.locator("details summary").click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(
      () => (document.querySelector(".steps button")?.getBoundingClientRect().width ?? 0) > 80,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Theme", exact: true }).click();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setViewportSize({ width: 390, height: 844 });

    if (process.env.VELVET_ONBOARDING_SCREENSHOT) {
      await page.screenshot({
        path: process.env.VELVET_ONBOARDING_SCREENSHOT,
        fullPage: true,
      });
    }
    const themeRadios = page.locator('input[name="system-theme"]');
    assert.equal(await themeRadios.count(), 4);
    // Square, and cut to a squircle rather than to a radius, which is the
    // shape the steps above it carry. The path is derived from the option's
    // measured width, so it lands on the frame after the step opens.
    await page
      .locator("[data-theme-card-option] .body")
      .first()
      .evaluate((element) =>
        new Promise<void>((settle) => {
          const check = () => {
            if (getComputedStyle(element).clipPath.startsWith("path(")) settle();
            else requestAnimationFrame(check);
          };
          check();
        }),
      );
    await themeRadios.first().focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await themeRadios.nth(1).isChecked(), true);
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const reviewItems = page.locator("[data-review-item]");
    assert.equal(await reviewItems.count(), 5);
    assert.deepEqual(
      await reviewItems.locator("dt").allTextContents(),
      ["Repository", "Status page", "Service", "Theme", "Custom domain"],
    );
    assert.equal(await reviewItems.getByText("status.example.com").count(), 1);
    assert.deepEqual(
      await page.locator("[data-review-squircle]").first().locator("path")
        .evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke-width"))),
      ["1", "4"],
    );
    assert.equal(await reviewItems.locator("i.ph-duotone").count(), 5);
    const reviewCards = page.locator("[data-review-card]");
    assert.equal(await reviewCards.count(), 5);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.match(
      await page.getByText(/DNS changes happen outside Velvet/).textContent() ?? "",
      /may take time to propagate/,
    );
    await page.locator(".steps button").nth(1).click();
    await page.getByRole("button", { name: "Add another service" }).click();
    const secondService = page.locator("[data-service-editor-item]").nth(1);
    await secondService.getByLabel("Service name").fill("API");
    await secondService.getByLabel("URL to monitor").fill("https://api.example.com");
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    assert.deepEqual(
      await page.locator("[data-review-item]").nth(2).evaluate((item) => ({
        label: item.querySelector("dt")?.textContent,
        value: item.querySelector("dd")?.textContent,
      })),
      { label: "Services", value: "2" },
    );
    // Being named as a reference is asked for rather than assumed, so the box
    // starts empty. Ticking it by keyboard alone also proves the sentence
    // beside it is part of the same control rather than loose text.
    const galleryConsent = page.locator(".gallery-consent input");
    assert.equal(await galleryConsent.isChecked(), false);
    await galleryConsent.focus();
    await page.keyboard.press("Space");
    assert.equal(await galleryConsent.isChecked(), true);
    assert.equal(
      await page.evaluate((key) => {
        const stored = sessionStorage.getItem(key);
        return stored === null
          ? null
          : (
              JSON.parse(stored) as {
                draft?: { listInGallery?: unknown };
              }
            ).draft?.listInGallery;
      }, ONBOARDING_SESSION_STORAGE_KEY),
      true,
      "the answer must survive the two GitHub approvals, which reload the page",
    );
    await page.goto(
      `http://127.0.0.1:${address.port}/onboarding.html?github=connected`,
    );

    await page.getByText(
      "Velvet is published. Your custom domain will work after its DNS records have propagated.",
    ).waitFor();
    // The stream above reported only the first and the last stage, which is
    // what a real run looks like after its second approval, since the server
    // never re-announces a stage it has already finished. Every entry must
    // still read as complete, because the furthest stage reached was the last
    // one. Deriving this per stage left a finished step showing as pending.
    const progressEntries = page.locator(".deployment-progress li");
    const entryCount = await progressEntries.count();
    assert.equal(entryCount, SetupProgressStageSchema.anyOf.length);
    assert.equal(
      await page.locator(".deployment-progress li.complete").count(),
      entryCount,
    );
    assert.equal(
      await page.locator(".deployment-progress li i.ph-circle").count(),
      0,
      "a reached stage must not render the pending icon",
    );
    // Read once the run has settled, and the class and the colour together, so
    // the two come from the same moment. Reading them across two calls caught
    // the entry mid-update and measured the accent it carries until it is
    // complete.
    await page.locator('.result[data-setup-state="success"]').waitFor();
    // Read once the step has finished arriving. Whilst a view transition runs,
    // the browser computes styles from its snapshot, so an entry already
    // carrying `complete` still measured the accent it has before it.
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => {})),
      ),
    );
    // The stream reported its last stage and then succeeded, so nothing is
    // still running and no step is left turning a spinner.
    assert.equal(
      await page.locator(".deployment-progress li.running").count(),
      0,
      "a finished run leaves no step spinning",
    );
    assert.equal(
      await page.locator(".deployment-progress li i.ph-spinner-ball").count(),
      0,
    );
    // Once the page exists, going to it is the only thing left to offer.
    assert.equal(await page.locator("[data-open-status-page]").count(), 1);
    assert.equal(
      await page.locator("[data-open-status-page]").getAttribute("href"),
      "https://status.example.com/",
    );
    assert.equal(
      await page.locator("[data-open-status-page] i.ph-chart-line-up").count(),
      1,
    );
    // Installing is its own step, and the run ends there rather than under the
    // review items.
    assert.equal(
      await page.locator("[data-squircle-step]").count(),
      5,
    );
    assert.equal(
      await page.locator("[data-squircle-step][aria-current='step'] .label").textContent(),
      "Publish",
    );
    assert.equal(
      await page.locator("[data-step-card-body]:not([hidden])").count(),
      1,
      "only the publish body is shown once the run finishes",
    );
    // One serial on the page, in the footer, padded to five digits.
    assert.equal(await page.locator("[data-footer-serial]").count(), 1);
    assert.equal(
      await page.locator("[data-footer-serial]").textContent()
        .then((text) => text?.replace(/\s+/g, " ").trim()),
      "Serial # 00007",
    );
    assert.equal(await page.locator("[data-board-serial]").count(), 0);
    assert.equal(await page.locator("[data-card-serial]").count(), 0);
    assert.equal(sessionCalls, 1);
    assert.equal(setupCalls, 1);
    // The footer button is the single way to the finished page, asserted above.
    // A second link in the result would give the same destination two controls.
    assert.equal(
      await page.getByRole("link", { name: "Open your status page" }).count(),
      0,
    );
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.ok(dimensions.document <= dimensions.viewport);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true,
        value: undefined,
      });
    });
    await page.goto(`http://127.0.0.1:${address.port}/configurator.html`);
    // A first visit collapses every section, so expand them once before
    // inspecting their contents. A reader does the same before configuring.
    await page.locator("[data-toggle-all-sections]").click();
    await page
      .locator('[data-configurator-section="themes"][data-section-expanded="true"]')
      .waitFor();
    const cloudyAutumn = page.locator(
      '[data-theme-card-option="cloudy-autumn"]',
    );
    await cloudyAutumn.click();
    assert.equal(await cloudyAutumn.locator("input").isChecked(), true);
    const websiteIcons = page.locator("[data-service-icon-picker]").first();
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
    await addedIconPicker.getByRole("option", { name: "Storage" }).click();
    assert.deepEqual(
      await page.locator("button.summary .name").allTextContents(),
      ["Core API", "Storage"],
    );

    await page.setViewportSize({ width: 390, height: 844 });
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
    await motionPage.evaluate(() => {
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = (update) => {
        const transition = original(update);
        void transition.ready.then(() => {
          (globalThis as typeof globalThis & { __onboardingTransitionAnimations?: unknown })
            .__onboardingTransitionAnimations = document.getAnimations().map((animation) => {
              const effect = animation.effect as KeyframeEffect & {
                pseudoElement?: string | null;
              };
              return {
                name: animation instanceof CSSAnimation ? animation.animationName : "",
                pseudo: effect.pseudoElement,
                duration: effect.getTiming().duration,
                keyframeEasing: effect.getKeyframes().map(({ easing }) => easing),
                keyframeTransforms: effect.getKeyframes().map(({ transform }) => transform),
                keyframeHeights: effect.getKeyframes().map(({ height }) => height),
              };
            });
          (globalThis as typeof globalThis & { __onboardingTransitionOverflow?: unknown })
            .__onboardingTransitionOverflow = {
              group: getComputedStyle(
                document.documentElement,
                "::view-transition-group(onboarding-step-card)",
              ).overflow,
              pair: getComputedStyle(
                document.documentElement,
                "::view-transition-image-pair(onboarding-step-card)",
              ).overflow,
              maskImage: getComputedStyle(
                document.documentElement,
                "::view-transition-image-pair(onboarding-step-card)",
              ).maskImage,
              contentInset: getComputedStyle(document.documentElement)
                .getPropertyValue("--step-card-content-inset")
                .trim(),
              bodyPadding: getComputedStyle(
                document.querySelector("[data-step-card-body]:not([hidden])")!,
              ).padding,
              footerPadding: getComputedStyle(
                document.querySelector("[data-step-card-footer]")!,
              ).padding,
            };
        });
        return transition;
      };
    });
    await motionPage.getByLabel("Your GitHub name").fill("velvet-user");
    await motionPage.getByLabel("Repository name").fill("status");
    await motionPage.getByLabel("Status page name").fill("My Status");
    await motionPage.evaluate(() => {
      document.documentElement.style.setProperty("--step-card-content-inset", "28px");
    });
    await motionPage.getByRole("button", { name: "Services", exact: true }).click();
    await motionPage.waitForFunction(
      () =>
        [...document.querySelectorAll("[data-step-active-highlight]")]
          .flatMap((element) => element.getAnimations()).length >= 2,
      undefined,
      { polling: "raf", timeout: 1_000 },
    );
    const highlightAnimations = await motionPage
      .locator("[data-step-active-highlight]")
      .evaluateAll((elements) =>
        elements.flatMap((element) =>
          element.getAnimations().map((animation) => ({
            duration: animation.effect?.getTiming().duration,
            easing: animation.effect?.getTiming().easing,
          })),
        ),
      );
    assert.ok(highlightAnimations.length >= 2);
    assert.ok(highlightAnimations.every(({ duration }) => duration === 350));
    assert.ok(highlightAnimations.every(({ easing }) => easing === "ease-in-out"));
    await motionPage.waitForFunction(
      () => Array.isArray(
        (globalThis as typeof globalThis & { __onboardingTransitionAnimations?: unknown })
          .__onboardingTransitionAnimations,
      ),
      undefined,
      { polling: "raf", timeout: 1_000 },
    );
    const transitionAnimations = await motionPage.evaluate(() =>
      (globalThis as typeof globalThis & {
        __onboardingTransitionAnimations: Array<{
          name: string;
          pseudo: string | null | undefined;
          duration: number | CSSNumericValue | string;
          keyframeEasing: Array<string | undefined>;
          keyframeTransforms: Array<string | undefined>;
          keyframeHeights: Array<string | undefined>;
        }>;
      }).__onboardingTransitionAnimations,
    );
    const stepAnimations = transitionAnimations.filter(({ pseudo }) =>
      pseudo?.includes("(onboarding-step-card)"),
    );
    assert.ok(stepAnimations.some(({ name }) => name.includes("onboarding-slide-in-forward")));
    assert.ok(stepAnimations.some(({ name }) => name.includes("onboarding-slide-out-forward")));
    assert.ok(stepAnimations.every(({ duration }) => duration === 350));
    assert.ok(stepAnimations.every(({ keyframeEasing }) =>
      keyframeEasing.every((easing) => easing === "ease-in-out"),
    ));
    assert.ok(stepAnimations.some(({ name, keyframeTransforms }) =>
      name.includes("onboarding-slide-in-forward") &&
      keyframeTransforms.includes("translateX(100%)"),
    ));
    assert.ok(stepAnimations.some(({ name, keyframeTransforms }) =>
      name.includes("onboarding-slide-out-forward") &&
      keyframeTransforms.includes("translateX(-100%)"),
    ));
    const shellGroupAnimation = transitionAnimations.find(
      ({ pseudo }) =>
        pseudo === "::view-transition-group(onboarding-step-card-shell)",
    );
    assert.ok(shellGroupAnimation);
    assert.equal(shellGroupAnimation.duration, 350);
    assert.ok(
      new Set(shellGroupAnimation.keyframeHeights.filter(Boolean)).size > 1,
    );
    const transitionEffects = await motionPage.evaluate(() =>
      (globalThis as typeof globalThis & {
        __onboardingTransitionOverflow: {
          group: string;
          pair: string;
          maskImage: string;
          contentInset: string;
          bodyPadding: string;
          footerPadding: string;
        };
      }).__onboardingTransitionOverflow,
    );
    assert.deepEqual(
      {
        group: transitionEffects.group,
        pair: transitionEffects.pair,
        contentInset: transitionEffects.contentInset,
        bodyPadding: transitionEffects.bodyPadding,
        footerPadding: transitionEffects.footerPadding,
      },
      {
        group: "clip",
        pair: "clip",
        contentInset: "28px",
        bodyPadding: "28px",
        footerPadding: "0px 28px 28px",
      },
    );
    assert.match(
      transitionEffects.maskImage,
      /28px[\s\S]*calc\(100% - 28px\)/,
    );
    await motionPage.evaluate(() => {
      document.documentElement.style.setProperty("--step-card-content-inset", "20px");
    });
    assert.equal(
      transitionAnimations.some(({ pseudo }) => pseudo === "::view-transition-group(root)"),
      false,
    );
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
    const hoverIcon = motionIconPicker.getByRole("option", { name: "Storage" });
    await hoverIcon.hover();
    const hoverStyles = await hoverIcon.evaluate((element) => {
        const icon = element.querySelector("i");
        const background = element.querySelector(".option-background");
        const listbox = element.closest("[role='listbox']");
        const iconStyle = icon ? getComputedStyle(icon) : null;
        const backgroundStyle = background ? getComputedStyle(background) : null;
        const listboxStyle = listbox ? getComputedStyle(listbox) : null;
        const colorChannels = (color: string): number[] => {
          const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
          return color.startsWith("color(srgb")
            ? values.slice(0, 3).map((value) => value * 255)
            : values.slice(0, 3);
        };
        const hoverChannels = colorChannels(backgroundStyle?.fill ?? "");
        const idleChannels = colorChannels(listboxStyle?.backgroundColor ?? "");
        return {
          duration: iconStyle?.transitionDuration,
          transform: iconStyle?.transform,
          hoverOpacity: backgroundStyle?.opacity,
          maximumChannelDelta: Math.round(
            Math.max(
              ...hoverChannels.map(
                (channel, index) => Math.abs(channel - (idleChannels[index] ?? channel)),
              ),
            ),
          ),
        };
      });
    assert.equal(hoverStyles.duration, "0s");
    assert.equal(hoverStyles.hoverOpacity, "1");
    assert.equal(hoverStyles.transform, "matrix(1.1, 0, 0, 1.1, 0, 0)");
    assert.ok(hoverStyles.maximumChannelDelta >= 30);
    await motionIconPicker.getByRole("option", { name: "Automatic" }).focus();
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
      await motionIconPicker.getByRole("option", { name: "Calendar" })
        .getAttribute("aria-selected"),
      "true",
    );

    await motionPage.getByRole("button", { name: "Add another service" }).click();
    await motionPage.getByRole("button", { name: "Add another service" }).click();
    const serviceItems = motionPage.locator("[data-service-editor-item]");
    assert.equal(await serviceItems.count(), 3);
    const removedItemId = await serviceItems.first().getAttribute(
      "data-service-editor-item",
    );
    const nextItemId = await serviceItems.nth(1).getAttribute(
      "data-service-editor-item",
    );
    assert.ok(removedItemId);
    assert.ok(nextItemId);
    const removedItem = motionPage.locator(
      `[data-service-editor-item="${removedItemId}"]`,
    );
    const nextItem = motionPage.locator(
      `[data-service-editor-item="${nextItemId}"]`,
    );
    const initialRemovedHeight = await removedItem.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    const initialNextTop = await nextItem.evaluate(
      (element) => element.getBoundingClientRect().top + scrollY,
    );
    await removedItem.getByRole("button", { name: "Remove service 1" }).click();
    await motionPage.waitForFunction(
      (itemId) =>
        (document
          .querySelector(`[data-service-editor-item="${itemId}"]`)
          ?.getAnimations().length ?? 0) > 0,
      removedItemId,
      { polling: "raf", timeout: 1_000 },
    );
    await motionPage.waitForTimeout(150);
    const midpoint = await Promise.all([
      removedItem.evaluate((element) => element.getBoundingClientRect().height),
      nextItem.evaluate((element) => element.getBoundingClientRect().top + scrollY),
    ]);
    await removedItem.waitFor({ state: "detached" });
    const finalNextTop = await nextItem.evaluate(
      (element) => element.getBoundingClientRect().top + scrollY,
    );
    assert.ok(midpoint[0] > 0 && midpoint[0] < initialRemovedHeight);
    assert.ok(midpoint[1] < initialNextTop && midpoint[1] > finalNextTop);
    assert.equal(await serviceItems.count(), 2);
    await motionContext.close();

    // A repository whose name is already taken. Setup stops before creating
    // anything, and what happens next is the visitor's decision rather than
    // Velvet's, so both answers are checked: the one that changes the name and
    // the one that agrees to the deletion.
    const conflictContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    const conflictPage = await conflictContext.newPage();
    await refuseOffsiteRequests(conflictPage);
    await conflictPage.route("**/api/serial", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ next: 7 }),
      }),
    );
    await conflictPage.route("**/api/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          csrfToken: "S".repeat(43),
          user: {
            login: "velvet-user",
            avatarUrl: "https://avatars.githubusercontent.com/u/1",
          },
        }),
      }),
    );
    let logoutCalls = 0;
    await conflictPage.route("**/api/logout", async (route) => {
      logoutCalls += 1;
      await route.fulfill({ status: 204, body: "" });
    });
    // Flipped once the replace paths have been walked, to reach the state the
    // way out exists for.
    let setupFails = false;
    const replaceRequests: (boolean | undefined)[] = [];
    // Flipped once the deletable path has been walked, so the same page then
    // meets a repository Velvet has no say over.
    let notDeletable = false;
    await conflictPage.route("**/api/setup", async (route) => {
      const request = JSON.parse(route.request().postData() ?? "null") as {
        replaceExistingRepository?: boolean;
      };
      replaceRequests.push(request.replaceExistingRepository);
      if (setupFails) {
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: JSON.stringify({
            type: "error",
            error: {
              code: "SETUP_PARTIAL",
              message: "This session already created velvet-user/status.",
              errorId: "P".repeat(26),
            },
            recoverable: false,
          }),
        });
        return;
      }
      const refusal = (code: string, message: string) =>
        JSON.stringify({
          type: "error",
          error: { code, message, errorId: "R".repeat(26) },
          recoverable: true,
        });
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: request.replaceExistingRepository
          ? notDeletable
            ? refusal(
                "REPOSITORY_NOT_DELETABLE",
                "Velvet cannot delete velvet-user/status, because it does not manage it. Delete it on GitHub yourself, or choose another name.",
              )
            : JSON.stringify({
                type: "success",
                installationUrl: "https://velvet-user.github.io/status/",
                repositoryUrl: "https://github.com/velvet-user/status",
              })
          : refusal("REPOSITORY_EXISTS", "velvet-user/status already exists."),
      });
    });

    const conflictDraft = {
      version: 1,
      draft: {
        repositoryOwner: "velvet-user",
        repositoryName: "status",
        statusPageName: "My Status",
        customDomain: "",
        description: "",
        listInGallery: false,
        privateRepository: false,
        themeId: "velvet-default",
        services: [
          {
            id: "conflict-service",
            name: "Website",
            url: "https://example.com",
            icon: null,
            advanced: false,
            method: "GET",
            expectedStatusCodes: "200",
            maxRedirects: 3,
            timeoutMs: 5000,
            headers: [],
            jsonAssertions: [],
          },
        ],
      },
    };
    await conflictPage.goto(`http://127.0.0.1:${address.port}/onboarding.html`);
    await conflictPage.evaluate(
      ([key, session]) => {
        sessionStorage.setItem(key as string, session as string);
      },
      [ONBOARDING_SESSION_STORAGE_KEY, JSON.stringify(conflictDraft)] as const,
    );
    await conflictPage.goto(
      `http://127.0.0.1:${address.port}/onboarding.html?github=connected`,
    );

    const conflictDialog = conflictPage.locator("[data-repository-conflict]");
    await conflictDialog.waitFor({ state: "visible" });
    // Modal, so nothing behind it can be reached whilst the question stands.
    assert.equal(
      await conflictDialog.evaluate((element) =>
        (element as HTMLDialogElement).matches(":modal"),
      ),
      true,
    );
    // It names the repository it is about, because agreeing to a deletion in
    // the abstract is not agreeing to this one.
    assert.match(
      (await conflictDialog.textContent()) ?? "",
      /velvet-user\/status/,
    );
    assert.deepEqual(replaceRequests, [undefined]);

    // Declining sends the visitor to the field that decides the name, and
    // focuses it, because that is the only thing worth changing here.
    await conflictPage.locator("[data-choose-another-name]").click();
    await conflictDialog.waitFor({ state: "hidden" });
    assert.equal(
      await conflictPage.locator("#repository-name").evaluate(
        (element) => element === document.activeElement,
      ),
      true,
      "declining must land on the repository name",
    );
    assert.deepEqual(replaceRequests, [undefined], "declining sends nothing");

    // Accepting asks again with the permission attached, and only then.
    await conflictPage.goto(
      `http://127.0.0.1:${address.port}/onboarding.html?github=connected`,
    );
    await conflictDialog.waitFor({ state: "visible" });
    await conflictPage.locator("[data-replace-repository]").click();
    await conflictPage.locator("[data-open-status-page]").waitFor();
    assert.deepEqual(replaceRequests, [undefined, undefined, true]);

    // A repository Velvet does not manage cannot be deleted by it, so the
    // question stops offering that and points at the repository instead.
    notDeletable = true;
    // The successful run above cleared the draft, so it is put back before the
    // same page meets the same name again.
    await conflictPage.evaluate(
      ([key, session]) => {
        sessionStorage.setItem(key as string, session as string);
      },
      [ONBOARDING_SESSION_STORAGE_KEY, JSON.stringify(conflictDraft)] as const,
    );
    await conflictPage.goto(
      `http://127.0.0.1:${address.port}/onboarding.html?github=connected`,
    );
    await conflictDialog.waitFor({ state: "visible" });
    await conflictPage.locator("[data-replace-repository]").click();
    await conflictDialog.waitFor({ state: "visible" });
    assert.equal(
      await conflictPage.locator("[data-replace-repository]").count(),
      0,
      "the destructive answer is withdrawn once it is known to be impossible",
    );
    assert.equal(
      await conflictPage
        .locator("[data-open-existing-repository]")
        .getAttribute("href"),
      "https://github.com/velvet-user/status",
    );
    assert.match(
      (await conflictDialog.textContent()) ?? "",
      /Delete it on GitHub yourself/,
    );
    // A setup that cannot be continued needs a way out of the session holding
    // it, and the way out has to say which account it leaves. Before this the
    // service asked people to sign out and the page offered nothing to do it
    // with.
    notDeletable = false;
    setupFails = true;
    await conflictPage.evaluate(
      ([key, session]) => {
        sessionStorage.setItem(key as string, session as string);
      },
      [ONBOARDING_SESSION_STORAGE_KEY, JSON.stringify(conflictDraft)] as const,
    );
    await conflictPage.goto(
      `http://127.0.0.1:${address.port}/onboarding.html?github=connected`,
    );
    const signOut = conflictPage.locator("[data-sign-out]");
    await signOut.waitFor({ state: "visible" });
    assert.match(
      (await signOut.textContent()) ?? "",
      /velvet-user/,
      "the way out names the account it leaves",
    );
    await signOut.click();
    // Counted here rather than in the page, which cannot see this variable.
    // Signing out reads the session before it posts, so the request arrives a
    // moment after the click.
    for (let waited = 0; waited < 50 && logoutCalls === 0; waited += 1) {
      await new Promise((settle) => setTimeout(settle, 100));
    }
    assert.equal(logoutCalls, 1, "signing out reaches the service");

    await conflictContext.close();
  } finally {
    await browser.close();
    await server.close();
    await cache.cleanup();
  }
}, ONBOARDING_TIMEOUT_MS);
