import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

import { SetupProgressStageSchema } from "@velvet/contracts";

import {
  STEP_CARD_CONTENT_INSET,
  STEP_CARD_FOOTER_INSET,
  STEP_CARD_BUTTON_RADIUS,
  STEP_CARD_INNER_RADIUS,
  STEP_CARD_RADIUS,
} from "../src/components/step-card/geometry.js";
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
    // The circuit-board layer covers instead of repeating, which fits it to the
    // window and crops it rather than stretching it out of proportion.
    assert.ok(
      backdrop.size.includes("cover"),
      `expected a covering layer, got ${backdrop.size.join(" | ")}`,
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
    assert.equal(await page.locator("[data-page-footer]").count(), 1);
    assert.equal(
      await page.locator("[data-page-footer]").evaluate((element) =>
        getComputedStyle(element).position,
      ),
      "fixed",
    );
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
    assert.deepEqual(
      await page.locator(".intro > p").evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          marginTop: style.marginTop,
          sectionMarginBottom: getComputedStyle(element.parentElement!).marginBottom,
        };
      }),
      { fontSize: "32px", marginTop: "56px", sectionMarginBottom: "72px" },
    );
    assert.match(
      await page.locator(".onboarding-shell").evaluate((element) =>
        getComputedStyle(element).fontFamily,
      ),
      /Barlow/,
    );
    assert.match(
      await page.locator(".velvet-section-heading h2").first().evaluate((element) =>
        getComputedStyle(element).fontFamily,
      ),
      /Barlow Condensed/,
    );
    const stepCard = page.locator("[data-step-card]");
    assert.equal(await stepCard.count(), 1);
    assert.equal(await page.locator("[data-squircle-surface]").count(), 0);
    // Read from the constant and from the token rather than written out, so
    // this says the card takes the geometry and the surface the product
    // states. Written out, it failed whenever either was deliberately changed,
    // which is a test reporting the change rather than a fault.
    assert.deepEqual(
      await stepCard.evaluate((element) => {
        const style = getComputedStyle(element);
        // What the card draws, beside what the token it draws from resolves to.
        const probe = document.createElement("div");
        probe.style.boxShadow = "var(--velvet-card-shadow)";
        document.body.append(probe);
        const fromToken = getComputedStyle(probe).boxShadow;
        probe.remove();
        return {
          borderRadius: style.borderTopLeftRadius,
          overflow: style.overflow,
          shadowMatchesToken: style.boxShadow === fromToken,
          // Two layers: a near one for the card's edge and a far one for its
          // height. One wide shadow alone dissolves into the board backdrop.
          shadowLayers: (style.boxShadow.match(/rgba?\(/gu) ?? []).length,
          // No blur. The surface is barely transparent so the board shows
          // through it, and a blur behind it averages the traces into an even
          // fog, which reads as an opaque card.
          backdropFilter: style.backdropFilter,
        };
      }),
      {
        borderRadius: `${STEP_CARD_RADIUS}px`,
        overflow: "clip",
        shadowMatchesToken: true,
        shadowLayers: 2,
        backdropFilter: "none",
      },
    );
    // Five: the four the visitor fills in, plus Install, which reports the
    // setup rather than collecting anything.
    assert.equal(await stepCard.locator("[data-step-card-body]").count(), 5);
    assert.equal(await stepCard.locator("[data-step-card-footer]").count(), 1);
    assert.equal(
      await page.locator(".form-actions").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.deepEqual(
      await stepCard.locator("[data-step-card-body]").first().evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
      }),
      // The card holds its content equally on all four sides, and the figure
      // comes from the constant so this asserts the rule rather than the
      // number the rule produces today.
      Array.from({ length: 4 }, () => `${STEP_CARD_CONTENT_INSET}px`),
    );
    assert.deepEqual(
      await stepCard.locator("[data-step-card-footer]").evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
      }),
      // Nothing above it, because the body it follows already ends at that
      // distance and a second gap would double it.
      [
        "0px",
        `${STEP_CARD_FOOTER_INSET}px`,
        `${STEP_CARD_FOOTER_INSET}px`,
        `${STEP_CARD_FOOTER_INSET}px`,
      ],
    );
    const ownerInput = page.getByLabel("Your GitHub name");
    assert.equal(
      await ownerInput.evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "1px",
    );
    assert.notEqual(
      await ownerInput.evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
      await page.locator("form").evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.deepEqual(
      await page.locator(".form-grid.two-columns").first().evaluate((grid) => {
        const statusPageName = grid.querySelector<HTMLInputElement>(
          'input[aria-describedby="status-page-name-help"]',
        )?.getBoundingClientRect();
        const customDomain = grid.querySelector<HTMLInputElement>(
          'input[aria-describedby="custom-domain-help"]',
        )?.getBoundingClientRect();
        return {
          sameRow: statusPageName?.top === customDomain?.top,
          separated: Boolean(
            statusPageName && customDomain && statusPageName.right < customDomain.left,
          ),
        };
      }),
      { sameRow: true, separated: true },
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(
      await Promise.all([
        ownerInput.evaluate((element) => element.getBoundingClientRect().height),
        page.getByRole("button", { name: "Services", exact: true }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
      ]),
      [40, 40],
    );
    assert.equal(
      await page.getByRole("button", { name: "Services", exact: true }).evaluate((element) =>
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
    assert.match(
      await page.locator(".steps button").first().evaluate((element) =>
        getComputedStyle(element).fontFamily,
      ),
      /Barlow Condensed/,
    );
    assert.equal(
      await page.locator(".steps button").first().evaluate((element) =>
        getComputedStyle(element).flexDirection,
      ),
      "column",
    );
    const mobileStepGeometry = await page.locator(".steps").evaluate((steps) => {
      const buttons = [...steps.querySelectorAll("button")];
      const first = buttons[0]?.getBoundingClientRect();
      const last = buttons.at(-1)?.getBoundingClientRect();
      const container = steps.getBoundingClientRect();
      return {
        width: first?.width ?? 0,
        height: first?.height ?? 0,
        occupiedWidth: first && last ? last.right - first.left : 0,
        containerWidth: container.width,
      };
    });
    assert.ok(Math.abs(mobileStepGeometry.width - mobileStepGeometry.height) < 0.1);
    assert.ok(
      mobileStepGeometry.occupiedWidth < mobileStepGeometry.containerWidth,
      JSON.stringify(mobileStepGeometry),
    );
    assert.equal(
      await page.locator("[data-squircle-step-number]").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "24px",
    );
    assert.equal(await page.locator("[data-step-connector]").count(), 4);
    // Only the stroked paths, since the step also carries an unstroked path that
    // fills its squircle so the page backdrop cannot show through it.
    assert.deepEqual(
      await page.locator("[data-squircle-step]").first().locator("svg:not([data-step-active-highlight]) path[stroke-width]")
        .evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke-width"))),
      ["1", "4"],
    );
    assert.deepEqual(
      await page.locator("[data-squircle-step]").first().locator("[data-step-active-highlight] path")
        .evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke-width"))),
      ["1", "4"],
    );
    assert.equal(
      await page.getByLabel("Your GitHub name").locator("xpath=preceding-sibling::span")
        .evaluate((element) => getComputedStyle(element).fontSize),
      "16px",
    );
    assert.deepEqual(
      await page.getByLabel("Your GitHub name").evaluate((input) => {
        const label = input.previousElementSibling as HTMLElement;
        const inputRect = input.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        return {
          left: Math.round(labelRect.left - inputRect.left),
          right: Math.round(inputRect.right - labelRect.right),
        };
      }),
      { left: 9, right: 9 },
    );
    assert.equal(
      await page.locator(".field-hint").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "13px",
    );
    assert.equal(
      await page.locator(".velvet-section-heading p").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "20px",
    );
    assert.deepEqual(
      await page.locator(".onboarding-brand-block").evaluate((element) => {
        const widths = [
          element.querySelector<HTMLElement>(".velvet-wordmark"),
          element.querySelector<HTMLElement>("[data-velvet-tool-palette]"),
          element.querySelector<HTMLElement>("[data-velvet-tool-subtitle]"),
        ].map((child) => Math.round(child?.getBoundingClientRect().width ?? 0));
        return widths;
      }),
      [270, 254, 254],
    );
    assert.equal(
      await page.locator("[data-velvet-tool-brand] .velvet-wordmark").evaluate(
        (element) => getComputedStyle(element).textAlign,
      ),
      "center",
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
    assert.equal(
      await page.locator(".field-error").evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "15px",
    );
    assert.equal(setupCalls, 0);
    assert.equal(
      (await page.locator('.steps button[aria-current="step"]').textContent())
        ?.replace(/\s+/g, " ")
        .trim(),
      "1 Basics",
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
      "18px",
    );
    assert.equal(
      await page.locator(".dns-guidance p").evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "20px",
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
    assert.equal(
      await page.getByLabel("Service name").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "1px",
    );
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
    assert.deepEqual(
      await setupIconOptions.first().evaluate((element) => {
        const icon = element.querySelector("i");
        return {
          iconSize: icon ? getComputedStyle(icon).fontSize : null,
          iconColor: icon ? getComputedStyle(icon).color : null,
          selectionDot: getComputedStyle(element, "::after").content,
          selectionBorders: [
            element.querySelector(".selection-outline.outer")?.getAttribute("stroke-width"),
            element.querySelector(".selection-outline.inner")?.getAttribute("stroke-width"),
          ],
          selectionOpacity: [...element.querySelectorAll(".selection-outline")].map(
            (path) => getComputedStyle(path).opacity,
          ),
        };
      }),
      {
        iconSize: "30px",
        iconColor: "rgb(255, 255, 255)",
        selectionDot: "none",
        selectionBorders: ["1", "4"],
        selectionOpacity: ["1", "1"],
      },
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '[data-step-card-body]:not([hidden]) [data-service-icon-picker] [role="option"] .selection-outline.outer',
          )
          ?.getAttribute("d")
          ?.startsWith("M") === true,
    );
    assert.deepEqual(
      await setupIconOptions.first().locator("[data-service-icon-squircle]").evaluate(
        (element) => {
          const path = element.querySelector("path")?.getAttribute("d") ?? "";
          const rect = element.getBoundingClientRect();
          return {
            drawn: path.startsWith("M"),
            square: Math.round(rect.width) === Math.round(rect.height),
          };
        },
      ),
      { drawn: true, square: true },
    );
    assert.deepEqual(
      await setupIconPicker.getByRole("listbox").evaluate((element) => {
        const picker = element.closest<HTMLElement>("[data-service-icon-picker]");
        const description = picker?.querySelector("p");
        const pickerRect = picker?.getBoundingClientRect();
        const listboxRect = element.getBoundingClientRect();
        return {
          position: getComputedStyle(element).position,
          shadow: getComputedStyle(element).boxShadow,
          fillsColumn: Math.round(listboxRect.width) === Math.round(pickerRect?.width ?? 0),
          descriptionAbove: Boolean(
            description &&
              description.getBoundingClientRect().bottom <= listboxRect.top,
          ),
        };
      }),
      {
        position: "static",
        shadow: "none",
        fillsColumn: true,
        descriptionAbove: true,
      },
    );
    assert.equal(
      await setupIconPicker.getByRole("listbox").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
      6,
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
    assert.equal(
      await page.locator(".service-editor").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    // The editor sits at the step card's content edge, so it takes the radius
    // derived for anything standing there. Read from that derivation rather
    // than written out, which is what keeps this an assertion about where the
    // editor sits instead of about a number.
    assert.equal(
      await page.locator(".service-editor").evaluate((element) =>
        getComputedStyle(element).borderTopLeftRadius,
      ),
      `${STEP_CARD_INNER_RADIUS}px`,
    );
    assert.equal(
      await page.locator(".service-editor label > span").first().evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "16px",
    );
    assert.deepEqual(
      await Promise.all([
        page.locator(".service-editor .field-hint").first().evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        setupIconPicker.locator(":scope > p").evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
      ]),
      ["13px", "20px"],
    );
    assert.equal(
      await page.locator("details").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    await page.locator("details summary").click();
    assert.equal(
      await page.locator(".advanced-content > p").evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "20px",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(
      () => (document.querySelector(".steps button")?.getBoundingClientRect().width ?? 0) > 80,
    );
    assert.deepEqual(
      await page.locator(".steps button").first().evaluate((element) => {
        const { width, height } = element.getBoundingClientRect();
        return [Math.round(width), Math.round(height)];
      }),
      [88, 88],
    );
    assert.equal(
      await page.locator(".steps").evaluate((element) =>
        getComputedStyle(element).columnGap,
      ),
      "42px",
    );
    // The row must stay a row. It wrapped when the grid was fixed at four
    // columns and a fifth step was added, dropping Install onto its own line.
    assert.deepEqual(
      await page.locator(".steps").evaluate((element) => {
        const tops = [...element.querySelectorAll("button")].map((button) =>
          Math.round(button.getBoundingClientRect().top),
        );
        return { count: tops.length, rows: [...new Set(tops)].length };
      }),
      { count: 5, rows: 1 },
    );
    assert.deepEqual(
      await page.locator(".steps li").first().evaluate((element) => {
        const button = element.querySelector("button")?.getBoundingClientRect();
        const connector = element.querySelector("[data-step-connector]")?.getBoundingClientRect();
        const nextButton = element.nextElementSibling?.querySelector("button")?.getBoundingClientRect();
        return {
          before: button && connector ? Math.round(connector.left - button.right) : null,
          after: connector && nextButton ? Math.round(nextButton.left - connector.right) : null,
        };
      }),
      { before: 5, after: 5 },
    );
    assert.deepEqual(
      await page.locator(".advanced-content > .form-grid").first().evaluate((grid) => ({
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        rows: new Set(
          [...grid.querySelectorAll("label")].map((label) =>
            Math.round(label.getBoundingClientRect().top),
          ),
        ).size,
      })),
      { columns: 4, rows: 1 },
    );
    assert.deepEqual(
      await Promise.all([
        page.getByRole("button", { name: "Add another service" }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
        page.getByRole("button", { name: "Basics", exact: true }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
        page.getByRole("button", { name: "Theme", exact: true }).evaluate((element) =>
          element.getBoundingClientRect().height,
        ),
      ]),
      [40, 40, 40],
    );
    assert.deepEqual(
      await page.getByRole("button", { name: "Theme", exact: true }).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderRadius: style.borderTopLeftRadius,
          minWidth: style.minWidth,
          paddingInline: [style.paddingLeft, style.paddingRight],
        };
      }),
      {
        // A footer button stands at the card's content edge like everything
        // else it holds, so it takes the radius derived for that edge.
        borderRadius: `${STEP_CARD_BUTTON_RADIUS}px`,
        minWidth: "112px",
        paddingInline: ["12px", "12px"],
      },
    );
    assert.ok(
      await page.getByRole("button", { name: "Theme", exact: true }).evaluate((element) => {
        const button = element.getBoundingClientRect();
        const label = element.querySelector("[data-step-card-button-label]")
          ?.getBoundingClientRect();
        if (!label) return false;
        return Math.abs((button.top + button.bottom - label.top - label.bottom) / 2) < 0.5;
      }),
    );
    assert.deepEqual(
      await page.getByRole("button", { name: "Add another service" }).evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.paddingLeft, style.paddingRight];
      }),
      ["8px", "8px"],
    );
    assert.ok(
      await page.locator("[data-service-editor-actions]").evaluate((actions) => {
        const button = actions.querySelector("button")?.getBoundingClientRect();
        const container = actions.getBoundingClientRect();
        return Boolean(button && Math.abs(button.right - container.right) < 0.5);
      }),
    );
    assert.equal(
      await page.locator("[data-service-editor-actions]").evaluate((actions) => {
        const service = actions.previousElementSibling
          ?.querySelector("[data-service-editor]:last-of-type")
          ?.getBoundingClientRect();
        const button = actions.querySelector("button")?.getBoundingClientRect();
        return service && button ? Math.round(button.top - service.bottom) : null;
      }),
      16,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Theme", exact: true }).click();

    await page.setViewportSize({ width: 1280, height: 800 });
    // All four included themes in one row, which is what makes them comparable
    // without scrolling between them.
    assert.equal(
      await page.locator("[data-theme-card-group] .options").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
      4,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.locator("[data-theme-card-group] .options").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
      1,
    );

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
        page.locator("[data-theme-card-group] h3").evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        page.locator("[data-theme-card-group] > p").evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        page.locator("[data-theme-card-option] strong").first().evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
      ]),
      ["20px", "20px", "16px"],
    );
    assert.equal(
      await page.locator("[data-theme-card-option]").first().evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
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
    assert.equal(
      await page.locator("[data-theme-card-option]").first().evaluate((element) => {
        const box = element.getBoundingClientRect();
        return Math.round(box.width) === Math.round(box.height);
      }),
      true,
      "a theme option is square",
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
    assert.equal(
      await reviewItems.evaluateAll((items) =>
        new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
      ),
      5,
    );
    assert.deepEqual(
      await page.locator("[data-review-squircle]").first().evaluate((element) => {
        const { width, height } = element.getBoundingClientRect();
        return [Math.round(width), Math.round(height)];
      }),
      [60, 60],
    );
    assert.deepEqual(
      await page.locator("[data-review-squircle]").first().locator("path")
        .evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke-width"))),
      ["1", "4"],
    );
    assert.deepEqual(
      await page.locator("[data-review-squircle]").first().locator("path")
        .evaluateAll((paths) => paths.map((path) => getComputedStyle(path).opacity)),
      ["0.32", "0.78"],
    );
    assert.equal(await reviewItems.locator("i.ph-duotone").count(), 5);
    const reviewCards = page.locator("[data-review-card]");
    assert.equal(await reviewCards.count(), 5);
    assert.equal(
      await reviewCards.first().evaluate((element) =>
        getComputedStyle(element).borderTopLeftRadius,
      ),
      `${STEP_CARD_INNER_RADIUS}px`,
    );
    assert.equal(
      await reviewItems.first().evaluate((item) => {
        const squircle = item.querySelector("[data-review-squircle]");
        const card = item.querySelector("[data-review-card]");
        return Boolean(
          squircle &&
          card &&
          !card.contains(squircle) &&
          squircle.getBoundingClientRect().right < card.getBoundingClientRect().left
        );
      }),
      true,
    );
    assert.equal(
      await page.locator("[data-review-squircle]").evaluateAll((elements) =>
        new Set(elements.map((element) => getComputedStyle(element).color)).size,
      ),
      1,
    );
    assert.equal(
      await reviewCards.evaluateAll((elements) =>
        new Set(elements.map((element) => getComputedStyle(element).backgroundColor)).size,
      ),
      1,
    );
    assert.match(
      await reviewCards.first().evaluate((element) =>
        getComputedStyle(element, "::before").maskImage,
      ),
      /linear-gradient\([\s\S]*80%[\s\S]*rgba\(0, 0, 0, 0\) 100%/,
    );
    assert.equal(
      await reviewCards.first().locator("dd").evaluate((element) =>
        getComputedStyle(element).opacity,
      ),
      "1",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.deepEqual(
      await page.locator("[data-review-list]").evaluate((list) => {
        const listRect = list.getBoundingClientRect();
        const bodyRect = list.closest("[data-step-card-body]")?.getBoundingClientRect();
        return {
          width: Math.round(listRect.width),
          centered: bodyRect
            ? Math.abs((listRect.left - bodyRect.left) - (bodyRect.right - listRect.right)) < 1
            : false,
        };
      }),
      { width: 704, centered: true },
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.match(
      await page.getByText(/DNS changes happen outside Velvet/).textContent() ?? "",
      /may take time to propagate/,
    );
    assert.equal(
      await reviewCards.first().evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
    assert.deepEqual(
      await Promise.all([
        reviewItems.locator("dt").first().evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        reviewItems.locator("dd").first().evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
        page.locator(".github-permission-note").evaluate((element) =>
          getComputedStyle(element).fontSize,
        ),
      ]),
      ["15px", "20px", "20px"],
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
      "18px",
    );
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
    assert.equal(
      await page.locator(".deployment-progress li.complete i").first()
        .evaluate((element) => getComputedStyle(element).color),
      "rgb(127, 221, 162)",
    );
    assert.equal(
      await page.locator(".deployment-progress li i").first()
        .evaluate((element) => getComputedStyle(element).fontSize),
      "26px",
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
    // Styled as a button but rendered as an anchor, so the geometry has to come
    // from the shared class rather than the element. It came out flat when the
    // height hung on the button selector alone.
    assert.deepEqual(
      await page.locator("[data-open-status-page]").evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          display: style.display,
          minHeight: style.minHeight,
          decoration: style.textDecorationLine,
        };
      }),
      { display: "flex", minHeight: "40px", decoration: "none" },
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
      "Serial Nr.: 00007",
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
    // A first visit collapses every section, so expand them once before
    // inspecting their contents. A reader does the same before configuring.
    await page.locator("[data-toggle-all-sections]").click();
    await page
      .locator('[data-configurator-section="themes"][data-section-expanded="true"]')
      .waitFor();
    assert.equal(
      await page.locator(".control-panel").evaluate((element) =>
        element.getBoundingClientRect().width,
      ),
      440,
    );
    assert.deepEqual(
      await page.locator(".configurator-brand").evaluate((element) => {
        const brand = element.querySelector<HTMLElement>("[data-velvet-tool-brand]");
        const wordmark = element.querySelector<HTMLElement>(".velvet-wordmark");
        const palette = element.querySelector<HTMLElement>("[data-velvet-tool-palette]");
        const rainbow = element.querySelector<HTMLElement>("[data-rainbow-scale]");
        const subtitle = element.querySelector<HTMLElement>("[data-velvet-tool-subtitle]");
        const subtitleLetters = subtitle
          ? [...subtitle.querySelectorAll<HTMLElement>("span")]
          : [];
        const elements = [wordmark, palette, subtitle];
        const widths = elements.map((child) =>
          Math.round(child?.getBoundingClientRect().width ?? 0),
        );
        const rainbowWidth = Math.round(
          rainbow?.getBoundingClientRect().width ?? 0,
        );
        const stacked =
          wordmark && palette && subtitle
            ? wordmark.getBoundingClientRect().bottom <=
                palette.getBoundingClientRect().top &&
              palette.getBoundingClientRect().bottom <=
                subtitle.getBoundingClientRect().top
            : false;
        return {
          order: [...(brand?.children ?? [])].map((child) => {
            if (child.classList.contains("velvet-wordmark")) return "velvet-wordmark";
            if (child.hasAttribute("data-velvet-tool-palette")) return "palette";
            if (child.hasAttribute("data-velvet-tool-subtitle")) return "subtitle";
            return "unknown";
          }),
          widthsArePositive: widths.every((width) => width > 0),
          innerWidthsMatch: Math.abs(widths[1] - widths[2]) <= 1,
          rainbowMatchesPalette: Math.abs(rainbowWidth - widths[1]) <= 1,
          innerWidthRatio:
            widths[0] > 0 ? Number((widths[1] / widths[0]).toFixed(2)) : 0,
          // Read from the text rather than from an aria-label. The subtitle is
          // set letter by letter for its spacing, and the accessible name for
          // the whole lockup lives on the heading, which is the only element
          // here where aria-label is permitted.
          subtitleText: subtitle?.textContent?.trim(),
          headingName: brand?.getAttribute("aria-label"),
          subtitleEdges:
            subtitle && subtitleLetters.length > 1
              ? [
                  Math.round(
                    subtitleLetters[0].getBoundingClientRect().left -
                      subtitle.getBoundingClientRect().left,
                  ),
                  Math.round(
                    subtitle.getBoundingClientRect().right -
                      subtitleLetters.at(-1)!.getBoundingClientRect().right,
                  ),
                ]
              : null,
          stacked,
        };
      }),
      {
        order: ["velvet-wordmark", "palette", "subtitle"],
        widthsArePositive: true,
        innerWidthsMatch: true,
        rainbowMatchesPalette: true,
        innerWidthRatio: 0.94,
        subtitleText: "CONFIGURATOR",
        headingName: "Velvet CONFIGURATOR",
        subtitleEdges: [0, 0],
        stacked: true,
      },
    );
    assert.deepEqual(
      await page.locator("[data-rainbow-scale]").first().evaluate((element) => {
        const first = getComputedStyle(element.firstElementChild!);
        const last = getComputedStyle(element.lastElementChild!);
        return {
          first: [
            first.borderTopLeftRadius,
            first.borderTopRightRadius,
            first.borderBottomRightRadius,
            first.borderBottomLeftRadius,
          ],
          last: [
            last.borderTopLeftRadius,
            last.borderTopRightRadius,
            last.borderBottomRightRadius,
            last.borderBottomLeftRadius,
          ],
        };
      }),
      {
        first: ["999px", "0px", "0px", "999px"],
        last: ["0px", "999px", "999px", "0px"],
      },
    );
    const cloudyAutumn = page.locator(
      '[data-theme-card-option="cloudy-autumn"]',
    );
    await cloudyAutumn.click();
    assert.equal(await cloudyAutumn.locator("input").isChecked(), true);
    const websiteIcons = page.locator("[data-service-icon-picker]").first();
    assert.equal(
      await websiteIcons.getByRole("option").first().locator("i").evaluate((element) =>
        getComputedStyle(element).fontSize,
      ),
      "22.4px",
    );
    assert.deepEqual(
      await websiteIcons.getByRole("option").first().evaluate((element) => ({
        selectionTransform: getComputedStyle(
          element.querySelector(".selection-outline.outer")!,
        ).transform,
        selectedIconColor: getComputedStyle(element.querySelector("i")!).color,
      })),
      {
        selectionTransform: "matrix(1.14, 0, 0, 1.14, 0, 0)",
        selectedIconColor: "rgb(255, 255, 255)",
      },
    );
    assert.deepEqual(
      await websiteIcons.getByRole("listbox").evaluate((element) => {
        const style = getComputedStyle(element);
        const picker = element.closest<HTMLElement>("[data-service-icon-picker]");
        return {
          columns: style.gridTemplateColumns.split(" ").length,
          rows: style.gridTemplateRows.split(" ").length,
          shadow: style.boxShadow,
          fillsColumn:
            Math.round(element.getBoundingClientRect().width) ===
            Math.round(picker?.getBoundingClientRect().width ?? 0),
        };
      }),
      { columns: 11, rows: 2, shadow: "none", fillsColumn: true },
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
    assert.equal(
      await firstService.getByLabel("Service name").evaluate((element) =>
        getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
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
    const motionIconListbox = motionIconPicker.getByRole("listbox");
    assert.equal(
      await motionIconListbox.evaluate((element) =>
        getComputedStyle(element).transitionDuration,
      ),
      "0s",
    );
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
        body: JSON.stringify({ authenticated: true, csrfToken: "S".repeat(43) }),
      }),
    );
    const replaceRequests: (boolean | undefined)[] = [];
    // Flipped once the deletable path has been walked, so the same page then
    // meets a repository Velvet has no say over.
    let notDeletable = false;
    await conflictPage.route("**/api/setup", async (route) => {
      const request = JSON.parse(route.request().postData() ?? "null") as {
        replaceExistingRepository?: boolean;
      };
      replaceRequests.push(request.replaceExistingRepository);
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
    await conflictContext.close();
  } finally {
    await browser.close();
    await server.close();
    await cache.cleanup();
  }
}, ONBOARDING_TIMEOUT_MS);
