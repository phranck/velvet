import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "bun:test";
import { chromium, type Frame, type Page } from "playwright";
import { build } from "vite";

import hostedConfiguratorConfig from "../vite.configurator.js";

/**
 * Building the application and launching a browser costs far more than a unit
 * test, though a good deal less than a dev server: nothing is compiled on
 * demand and no dependency optimiser runs.
 */
const CONFIGURATOR_TIMEOUT_MS = 120_000;

/** Where the monitor asks for a theme, and where those documents really are. */
const THEME_PATH = "/config/themes";
const THEMES = resolve(import.meta.dirname, "../../config/themes");

const SIGNED_IN = {
  authenticated: true,
  csrfToken: "C".repeat(43),
  user: {
    login: "velvet-user",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
  },
};

function installation(overrides: Record<string, unknown> = {}) {
  return {
    installationId: 7,
    repositoryId: 9,
    owner: "velvet-user",
    name: "status",
    htmlUrl: "https://github.com/velvet-user/status",
    installedVersion: "1.9.0",
    ...overrides,
  };
}

/**
 * The built configurator, produced once for every test in this file.
 *
 * Built rather than served from a dev server, because that is what a visitor
 * gets. A dev server also reloads the page once whilst its dependency
 * optimiser catches up, which counts as a second visit and made a page that
 * opens correctly look as though it opened twice.
 */
const built = (async () => {
  const directory = await mkdtemp(join(tmpdir(), "velvet-configurator-"));
  await build({
    ...hostedConfiguratorConfig,
    root: resolve(import.meta.dirname, ".."),
    // Stated, because `build` otherwise loads site/vite.config.ts as well and
    // merges it over this one, which builds the status page instead.
    configFile: false,
    logLevel: "silent",
    build: { ...hostedConfiguratorConfig.build, outDir: directory },
  });
  return directory;
})();

/**
 * Serves the built application and answers the routes it opens with.
 *
 * @param listing - What `/api/installations` replies with.
 * @param visit - What to assert once the page has settled.
 * @param session - What `/api/session` replies with.
 * @param configuration - What `/api/configuration` replies with, which decides
 *   the theme the configurator opens on.
 */
async function withConfigurator(
  listing: unknown,
  visit: (page: Page) => Promise<void>,
  session: unknown = SIGNED_IN,
  configuration: unknown = { theme: null, themeSettings: {} },
): Promise<void> {
  const root = await built;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/session") return Response.json(session);
      if (url.pathname === "/api/installations") return Response.json(listing);
      // What the chosen installation is published in, which the configurator
      // asks for as soon as it has one.
      if (url.pathname === "/api/configuration") {
        return Response.json(configuration);
      }
      // The monitor loads a theme from the service's own path. Those documents
      // are written by `configurator:themes` into the repository rather than
      // produced by the bundle this test builds, so they are served from where
      // they actually are.
      if (url.pathname.startsWith(`${THEME_PATH}/`)) {
        const wanted = resolve(THEMES, url.pathname.slice(THEME_PATH.length + 1));
        if (!wanted.startsWith(`${THEMES}/`)) {
          return new Response(null, { status: 403 });
        }
        const preview = Bun.file(wanted);
        return (await preview.exists())
          ? new Response(preview)
          : new Response(null, { status: 404 });
      }
      const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = Bun.file(resolve(root, path));
      return (await file.exists())
        ? new Response(file)
        : new Response(null, { status: 404 });
    },
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/`);
    await visit(page);
  } finally {
    await browser.close();
    server.stop(true);
  }
}

/**
 * The installations on offer, told apart from the themes beside them.
 *
 * The sidebar carries two radio groups drawn from the same component, so a
 * plain class matches both. The label is what says which one this is, and it is
 * the same string somebody using a screen reader hears.
 *
 * @param page - The page under test.
 * @returns The items of the installation chooser.
 */
function installationItems(page: Page) {
  return page.locator(
    '[role="radiogroup"][aria-label="Velvet installations you may configure"] .chooser__item',
  );
}

test(
  "offers the signed-in account's installations and chooses a single one",
  async () => {
    await withConfigurator(
      { repositories: [installation()], truncated: false },
      async (page) => {
        const item = installationItems(page);
        await item.waitFor();

        assert.equal(await item.count(), 1);
        assert.match(await item.innerText(), /velvet-user\/status/u);
        assert.equal(
          await item.getAttribute("aria-checked"),
          "true",
          "offering a choice of one asks somebody to confirm what was never in question",
        );
        assert.match(
          await page.locator(".sidebar__foot").innerText(),
          /velvet-user/u,
        );
      },
    );
  },
  CONFIGURATOR_TIMEOUT_MS,
);

test(
  "asks the service exactly once for what it opens with",
  async () => {
    await withConfigurator(
      { repositories: [installation()], truncated: false },
      async (page) => {
        const asked: string[] = [];
        page.on("request", (request) => {
          const { pathname } = new URL(request.url());
          if (pathname.startsWith("/api/")) asked.push(pathname);
        });
        await page.reload();
        await installationItems(page).waitFor();
        // The third asks what the chosen installation is published in, which
        // it can only do once it has one.
        await page.waitForFunction(() =>
          document.querySelector(".current__name") !== null,
        );

        assert.deepEqual(asked, [
          "/api/session",
          "/api/installations",
          "/api/configuration",
        ]);
      },
    );
  },
  CONFIGURATOR_TIMEOUT_MS,
);

test(
  "chooses between several, and says when the list is a prefix",
  async () => {
    await withConfigurator(
      {
        repositories: [
          installation(),
          installation({ repositoryId: 10, name: "second" }),
        ],
        truncated: true,
      },
      async (page) => {
        const items = installationItems(page);
        await items.first().waitFor();

        assert.equal(await items.count(), 2);
        assert.equal(await items.nth(0).getAttribute("aria-checked"), "true");
        assert.equal(await items.nth(1).getAttribute("aria-checked"), "false");

        await items.nth(1).click();
        assert.equal(await items.nth(0).getAttribute("aria-checked"), "false");
        assert.equal(await items.nth(1).getAttribute("aria-checked"), "true");
        assert.match(
          await page.locator(".sidebar__foot").innerText(),
          /velvet-user\/second/u,
        );

        assert.equal(
          await page.locator(".note").count(),
          1,
          "an installation missing from a list looks exactly like one that does not exist",
        );
      },
    );
  },
  CONFIGURATOR_TIMEOUT_MS,
);

test(
  "sends somebody with nothing installed to setup, saying why",
  async () => {
    await withConfigurator(
      {
        repositories: [installation({ installedVersion: null })],
        truncated: false,
      },
      async (page) => {
        const action = page.locator(".action");
        await action.waitFor();

        assert.equal(await action.getAttribute("href"), "/onboarding/");
        assert.match(
          await page.locator(".failure").innerText(),
          /None of the repositories you granted access to carries a Velvet installation/u,
          "the reason is on the page rather than left to be guessed at",
        );
        assert.equal(await page.locator(".chooser__item").count(), 0);
      },
    );
  },
  CONFIGURATOR_TIMEOUT_MS,
);

test(
  "says what to do when the service answers something it cannot read",
  async () => {
    await withConfigurator({ repositories: "all of them" }, async (page) => {
      const notice = page.locator(".failure__heading");
      await notice.waitFor();

      assert.match(await notice.innerText(), /could not start/u);
      assert.equal(await page.locator(".chooser__item").count(), 0);
    });
  },
  CONFIGURATOR_TIMEOUT_MS,
);


test(
  "derives every rounding from the two values that are stated",
  async () => {
    await withConfigurator(
      {
        repositories: [
          installation(),
          installation({ repositoryId: 10, name: "second" }),
        ],
        truncated: false,
      },
      async (page) => {
        await installationItems(page).first().waitFor();

        const geometry = await page.evaluate(() => {
          const pixels = (element: Element, property: string): number =>
            Number.parseFloat(
              getComputedStyle(element).getPropertyValue(property),
            );
          // A section is a surface standing on the sidebar, the chooser inside
          // it is nested, and a placeholder is prose in a rounded surface. The
          // section is taken from the item so the two are genuinely one inside
          // the other rather than two that happen to read the same tokens.
          const item = document.querySelector(".chooser__item")!;
          const section = item.closest(".section")!;
          const content = section.querySelector(".section__content")!;
          const prose = document.querySelector(".section__content p")!;
          return {
            outer: pixels(section, "border-top-left-radius"),
            inset: pixels(content, "padding-left"),
            inner: pixels(item, "border-top-left-radius"),
            textInset: pixels(prose, "padding-left"),
            corners: [
              "border-top-left-radius",
              "border-top-right-radius",
              "border-bottom-left-radius",
              "border-bottom-right-radius",
            ].map((corner) => pixels(item, corner)),
          };
        });

        // The relation rather than the numbers, so this survives the design
        // moving and still catches a derivation that came back empty.
        assert.equal(
          geometry.inner,
          Math.max(geometry.outer - geometry.inset, 0),
          "a nested radius is the outer radius less the distance to it",
        );
        assert.equal(
          geometry.textInset,
          geometry.outer / 2,
          "text stands in by half the radius, because a line flush against a curve reads as colliding with it",
        );
        assert.ok(geometry.outer > 0, "nothing on this surface is square");
        assert.deepEqual(
          geometry.corners,
          [geometry.inner, geometry.inner, geometry.inner, geometry.inner],
          "all four corners hold the same distance from the outer curve",
        );
      },
    );
  },
  CONFIGURATOR_TIMEOUT_MS,
);

test(
  "marks the chosen item by more than colour, and hover does not undo it",
  async () => {
    await withConfigurator(
      {
        repositories: [
          installation(),
          installation({ repositoryId: 10, name: "second" }),
        ],
        truncated: false,
      },
      async (page) => {
        const items = page.locator(".chooser__item");
        await items.first().waitFor();

        const surfaceOf = (index: number) =>
          items.nth(index).evaluate((element) => ({
            border: getComputedStyle(element).borderTopColor,
            background: getComputedStyle(element).backgroundColor,
          }));

        const chosen = await surfaceOf(0);
        const other = await surfaceOf(1);
        assert.notEqual(
          chosen.border,
          other.border,
          "the chosen item carries the accent on its edge",
        );
        assert.notEqual(
          chosen.background,
          other.background,
          "and the accent behind it, because colour alone asks a reader to compare two greys",
        );

        await items.nth(0).hover();
        const hovered = await surfaceOf(0);
        assert.equal(
          hovered.background,
          chosen.background,
          "hovering the chosen item must not take its surface away",
        );
      },
    );
  },
  CONFIGURATOR_TIMEOUT_MS,
);

/**
 * Reads one custom property off the page in the monitor, waiting for it to say
 * what is expected.
 *
 * The configurator tells the frame about a change by posting a message, so the
 * page has received it a moment after the control was operated rather than at
 * the instant. Waiting for the value rather than for a delay is what keeps this
 * from being timed by how busy the machine is.
 *
 * @param frame - The monitor's frame.
 * @param property - The custom property to read.
 * @param wanted - What it should come to say.
 * @returns What it said, which is `wanted` unless the wait ran out.
 */
async function shownInMonitor(
  frame: Frame,
  property: string,
  wanted: string,
): Promise<string> {
  const deadline = Date.now() + 5_000;
  let reading: string;
  do {
    reading = await frame.evaluate((name) => {
      const page = document.querySelector(".velvet-page");
      return page === null
        ? ""
        : getComputedStyle(page).getPropertyValue(name).trim();
    }, property);
    if (reading === wanted) return reading;
    await new Promise((settle) => setTimeout(settle, 50));
  } while (Date.now() < deadline);
  return reading;
}

test(
  "carries a change to the page in the monitor as soon as it is made",
  async () => {
    await withConfigurator(
      { repositories: [installation()], truncated: false },
      async (page) => {
        const frame = await page
          .waitForSelector("iframe")
          .then((element) => element.contentFrame());
        assert.ok(frame, "the monitor shows a page");
        await frame.waitForSelector(".velvet-page");

        // What the page stands at before anybody touches a control, which is
        // what the theme's own manifest states for it.
        assert.equal(
          await shownInMonitor(frame, "--chart-area-display", "block"),
          "block",
        );

        // Operated by clicking the words rather than the switch, because the
        // label is the control's name and that is what makes clicking it work.
        await page.locator('label[for="feature-chartWash"]').click();
        assert.equal(
          await shownInMonitor(frame, "--chart-area-display", "none"),
          "none",
          "the switch reaches the page in the monitor",
        );

        // A colour the theme declares on its own root, which is the harder of
        // the two: what an operator sets has to stand where the theme's own
        // declaration stands rather than be inherited into a losing position.
        await page.locator("#feature-ipv4Colour").evaluate((well) => {
          const input = well as HTMLInputElement;
          input.value = "#123456";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        assert.equal(
          await shownInMonitor(frame, "--protocol-ipv4", "#123456"),
          "#123456",
          "the colour well reaches the page in the monitor",
        );
      },
      SIGNED_IN,
      { theme: "velvet", themeSettings: {} },
    );
  },
  CONFIGURATOR_TIMEOUT_MS,
);

test("removes the directory it built into", async () => {
  await rm(await built, { recursive: true, force: true });
});
