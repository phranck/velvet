/**
 * The conformance suite: one set of questions asked of every theme, about what
 * it rendered rather than about how it was built.
 *
 * This is what replaces the property contract. Two gates used to check that 418
 * named custom properties existed and resolved, which says nothing about
 * whether the page is right: a theme can declare every property in the set and
 * still print last week's uptime beside a service nobody can reach with a
 * keyboard.
 *
 * What it asserts, against every fixture, for every theme:
 *
 *   - Every service's name appears, and beside it its uptime figure for the
 *     chosen range. The figure is compared against what the shared arithmetic
 *     computes from the same fixture, so a theme that does its own arithmetic
 *     and gets it wrong fails here. That is what makes the redundancy between
 *     themes safe.
 *   - Every visible incident appears with its title.
 *   - The version, the serial number and the line naming where the page is
 *     configured all appear.
 *   - Exactly one `h1`.
 *   - Every interactive element is reachable by keyboard and has a name a
 *     screen reader announces.
 *   - Nothing overflows the viewport at 320px.
 *   - Text meets its contrast: 4.5:1 for body, 3:1 for large text.
 *   - No request leaves the theme's own origin.
 *   - The focus ring is the theme's own and never the browser's default.
 *
 * The theme is served over a real HTTP origin rather than pushed into a blank
 * document, because a theme's own assets have to resolve the way they will
 * when it is published, and because "no request leaves this origin" is only a
 * question worth asking of a page that has one.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { Browser, Page } from "playwright";

import type { ThemeData } from "../src/lib/themes/data.js";
import { uptimeForRange, visibleIncidentEvents } from "../src/lib/data.js";
import { FIXTURES, type Fixture } from "../theme-bundles/fixtures/index.js";
import { readThemes, type ReadTheme } from "./themes.js";
import { themeSettingsStyle } from "../src/lib/themes/settings.js";

/** One thing a theme got wrong, named the way a person can act on it. */
export interface Finding {
  theme: string;
  fixture: string;
  check: string;
  detail: string;
}

/** Content types for everything a theme can serve. */
const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".avif": "image/avif",
};

/**
 * The document a theme is rendered into.
 *
 * The host owns everything outside the root element: the document language, the
 * viewport, and the element the markup goes into. A theme owns what is inside
 * it, which is why the page below carries no styling of its own beyond removing
 * the default margin the user agent puts on the body.
 */
function hostDocument(
  markup: string,
  title: string,
  data: unknown,
  settings: string,
): string {
  // The data rides in the document rather than being fetched, because the
  // theme is forbidden from fetching and the host has it already. The escape
  // is the one that matters: a service name containing `</script>` would
  // otherwise end the element early.
  const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="/theme.css" />
    <style>
      body { margin: 0; }
    </style>
    ${settings}
  </head>
  <body>
    <div id="velvet-root">${markup}</div>
    <script type="application/json" id="velvet-data">${payload}</script>
    <script type="module" src="/theme.js"></script>
  </body>
</html>`;
}

/** A theme, built and served, ready to be rendered against any fixture. */
interface ServedBundle {
  origin: string;
  close: () => Promise<void>;
}

/**
 * Builds a theme's script and serves the whole directory over HTTP.
 *
 * The script is bundled rather than served as TypeScript because a browser
 * cannot load TypeScript, and the point of the exercise is what a browser did.
 * Everything the theme references resolves against this origin, so a reference
 * that left the theme shows up as a request to somewhere else.
 */
async function serveBundle(
  theme: ReadTheme,
  render: (fixture: string) => string,
): Promise<ServedBundle> {
  const manifest = theme.manifest!;
  const workspace = await mkdtemp(join(tmpdir(), "velvet-conformance-"));
  const entry = join(workspace, "entry.ts");
  await writeFile(
    entry,
    `import script from ${JSON.stringify(join(theme.path, manifest.entries.script))};\n` +
      `const root = document.querySelector("#velvet-root");\n` +
      `const data = JSON.parse(document.querySelector("#velvet-data").textContent);\n` +
      `script(root, data);\n`,
  );
  const built = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
  });
  if (!built.success) {
    await rm(workspace, { recursive: true, force: true });
    throw new Error(
      `${theme.directory}: the script does not build: ${built.logs.join("\n")}`,
    );
  }
  const script = await built.outputs[0]!.text();

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname);
      if (path === "/theme.js") {
        return new Response(script, {
          headers: { "content-type": CONTENT_TYPES[".js"]! },
        });
      }
      if (path === "/theme.css") {
        return new Response(
          await readFile(join(theme.path, manifest.entries.styles)),
          { headers: { "content-type": CONTENT_TYPES[".css"]! } },
        );
      }
      const fixture = path.match(/^\/f\/([a-z0-9-]+)\/?$/);
      if (fixture) {
        return new Response(render(fixture[1]!), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      // Anything else is one of the theme's own files, addressed the way its
      // stylesheet addresses it.
      if (path.includes("..")) return new Response("no", { status: 400 });
      try {
        const file = Bun.file(join(theme.path, path.replace(/^\//, "")));
        if (!(await file.exists())) return new Response("not found", { status: 404 });
        return new Response(file, {
          headers: {
            "content-type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
          },
        });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  });

  return {
    origin: `http://localhost:${server.port}`,
    close: async () => {
      await server.stop(true);
      await rm(workspace, { recursive: true, force: true });
    },
  };
}

/**
 * Everything the suite reads off a rendered page in one pass.
 *
 * Gathered in a single `evaluate` because each crossing into the page costs a
 * round trip and there are eight themes times eight fixtures of them.
 */
async function inspect(page: Page) {
  return page.evaluate(() => {
    /** Text with runs of whitespace collapsed, which is how a reader sees it. */
    const flatten = (value: string): string =>
      value.replace(/\s+/gu, " ").trim();

    /** Whether an element takes up space and is not hidden. */
    const visible = (element: Element): boolean => {
      if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
        return false;
      }
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (Number(style.opacity) === 0) return false;
      return element.getClientRects().length > 0;
    };

    /** The name a screen reader would announce, near enough to judge by. */
    const accessibleName = (element: Element): string => {
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const named = labelledBy
          .split(/\s+/u)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
        if (flatten(named)) return flatten(named);
      }
      const label = element.getAttribute("aria-label");
      if (label && flatten(label)) return flatten(label);
      if (element instanceof HTMLInputElement && element.labels?.length) {
        const fromLabel = [...element.labels]
          .map((one) => one.textContent ?? "")
          .join(" ");
        if (flatten(fromLabel)) return flatten(fromLabel);
      }
      const own = flatten(element.textContent ?? "");
      if (own) return own;
      const title = element.getAttribute("title");
      if (title && flatten(title)) return flatten(title);
      const image = element.querySelector("img[alt]");
      const alt = image?.getAttribute("alt") ?? "";
      return flatten(alt);
    };

    const INTERACTIVE =
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"]';

    const root = document.querySelector("#velvet-root") ?? document.body;
    const interactive = [...root.querySelectorAll(INTERACTIVE)].filter(visible);
    interactive.forEach((element, index) => {
      element.setAttribute("data-conformance-index", String(index));
    });

    /** The colour behind an element, following ancestors until one is opaque. */
    const backgroundOf = (
      element: Element,
    ): { colour: [number, number, number]; painted: boolean } => {
      let node: Element | null = element;
      let layers: Array<[number, number, number, number]> = [];
      let image = false;
      while (node) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") image = true;
        const parsed = style.backgroundColor.match(
          /rgba?\(([^)]+)\)/u,
        );
        if (parsed) {
          const parts = parsed[1]!.split(/[\s,/]+/u).filter(Boolean).map(Number);
          const alpha = parts.length > 3 ? parts[3]! : 1;
          if (alpha > 0) {
            layers.push([parts[0]!, parts[1]!, parts[2]!, alpha]);
            if (alpha === 1) break;
          }
        }
        node = node.parentElement;
      }
      if (layers.length === 0) layers = [[255, 255, 255, 1]];
      // Composited from the back forwards, which is the order the eye sees.
      let result: [number, number, number] = [255, 255, 255];
      for (const [red, green, blue, alpha] of [...layers].reverse()) {
        result = [
          red * alpha + result[0] * (1 - alpha),
          green * alpha + result[1] * (1 - alpha),
          blue * alpha + result[2] * (1 - alpha),
        ];
      }
      return { colour: result, painted: image };
    };

    const texts: Array<{
      text: string;
      colour: [number, number, number];
      alpha: number;
      background: [number, number, number];
      overImage: boolean;
      size: number;
      bold: boolean;
      where: string;
    }> = [];
    for (const element of root.querySelectorAll("*")) {
      const own = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join(" ");
      if (!flatten(own)) continue;
      if (!visible(element)) continue;
      const style = getComputedStyle(element);
      const parsed = style.color.match(/rgba?\(([^)]+)\)/u);
      if (!parsed) continue;
      const parts = parsed[1]!.split(/[\s,/]+/u).filter(Boolean).map(Number);
      const background = backgroundOf(element);
      texts.push({
        text: flatten(own).slice(0, 40),
        colour: [parts[0]!, parts[1]!, parts[2]!],
        alpha: parts.length > 3 ? parts[3]! : 1,
        background: background.colour,
        overImage: background.painted,
        size: Number.parseFloat(style.fontSize),
        bold: Number(style.fontWeight) >= 700,
        where: `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? `.${element.className.split(/\s+/u)[0]}` : ""}`,
      });
    }

    /** What an element looks like now, so the focused state can be compared. */
    const appearance = (element: Element): string => {
      const style = getComputedStyle(element);
      return [
        style.outlineStyle,
        style.outlineWidth,
        style.outlineColor,
        style.boxShadow,
        style.borderColor,
        style.borderWidth,
        style.backgroundColor,
        style.color,
        style.textDecorationLine,
      ].join("|");
    };

    return {
      headings: root.querySelectorAll("h1").length,
      text: flatten(root.textContent ?? ""),
      interactive: interactive.map((element, index) => ({
        index,
        name: accessibleName(element),
        tag: element.tagName.toLowerCase(),
        resting: appearance(element),
      })),
      texts,
      // The figures, as the innermost element carrying each one.
      leaves: [...root.querySelectorAll("*")]
        .filter(
          (element) =>
            visible(element) &&
            flatten(element.textContent ?? "") !== "" &&
            [...element.children].every(
              (child) => flatten(child.textContent ?? "") !== flatten(element.textContent ?? ""),
            ),
        )
        .map((element) => {
          const context: string[] = [];
          let node: Element | null = element;
          for (let step = 0; step < 5 && node; step += 1) {
            context.push(flatten(node.textContent ?? ""));
            node = node.parentElement;
          }
          return { text: flatten(element.textContent ?? ""), context };
        }),
    };
  });
}

/** WCAG 2.1 relative luminance. */
function luminance([red, green, blue]: [number, number, number]): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** Contrast between two opaque colours. */
function contrast(
  front: [number, number, number],
  back: [number, number, number],
): number {
  const first = luminance(front);
  const second = luminance(back);
  const [high, low] = first > second ? [first, second] : [second, first];
  return (high + 0.05) / (low + 0.05);
}

/** Lays a translucent colour over an opaque one. */
function over(
  front: [number, number, number],
  back: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    front[0] * alpha + back[0] * (1 - alpha),
    front[1] * alpha + back[1] * (1 - alpha),
    front[2] * alpha + back[2] * (1 - alpha),
  ];
}

/** The figures the shared arithmetic computes from a fixture. */
function reference(data: ThemeData): {
  uptimes: Map<string, string>;
  incidents: string[];
} {
  const range = data.site.defaultRange;
  const uptimes = new Map<string, string>();
  for (const service of data.status.services) {
    uptimes.set(
      service.name,
      uptimeForRange(
        service,
        range,
        data.status.generatedAt,
        data.status.monitoringStartedAt,
      ),
    );
  }
  return {
    uptimes,
    incidents: visibleIncidentEvents(data.incidents.events).map(
      (event) => event.title,
    ),
  };
}

/** Runs every check against one theme rendered from one fixture. */
async function conformOne(
  page: Page,
  theme: ReadTheme,
  fixture: Fixture,
  origin: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const note = (check: string, detail: string): void => {
    findings.push({ theme: theme.directory, fixture: fixture.name, check, detail });
  };

  const offsite: string[] = [];
  const onRequest = (request: { url: () => string }): void => {
    const url = request.url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) {
      return;
    }
    offsite.push(url);
  };
  const errors: string[] = [];
  page.on("request", onRequest);
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin}/f/${fixture.name}/`, { waitUntil: "networkidle" });

  const seen = await inspect(page);
  const expected = reference(fixture.data);

  // ── The figures ───────────────────────────────────────────────────────────
  for (const service of fixture.data.status.services) {
    const figure = expected.uptimes.get(service.name)!;
    if (!seen.text.includes(service.name)) {
      note("services", `the name "${service.name}" does not appear`);
      continue;
    }
    const beside = seen.leaves.some(
      (leaf) =>
        leaf.context.some((text) => text.includes(service.name)) &&
        leaf.context.some((text) => text.includes(figure)),
    );
    if (!beside) {
      note(
        "figures",
        `"${service.name}" is not shown with its ${fixture.data.site.defaultRange} uptime of ${figure}`,
      );
    }
  }

  // ── The incidents ─────────────────────────────────────────────────────────
  for (const title of expected.incidents) {
    if (!seen.text.includes(title)) {
      note("incidents", `the visible incident "${title}" does not appear`);
    }
  }

  // ── What every page has to say about itself ───────────────────────────────
  if (!seen.text.includes(fixture.data.site.version)) {
    note("stamp", `the version ${fixture.data.site.version} does not appear`);
  }
  const serial = fixture.data.site.serial;
  if (serial !== null && !seen.text.includes(String(serial).padStart(5, "0"))) {
    note("stamp", `the serial number ${serial} does not appear`);
  }

  // ── One heading ───────────────────────────────────────────────────────────
  if (seen.headings !== 1) {
    note("heading", `the page has ${seen.headings} h1 elements rather than one`);
  }

  // ── Contrast ──────────────────────────────────────────────────────────────
  for (const text of seen.texts) {
    if (text.overImage) continue;
    const large = text.size >= 24 || (text.size >= 18.66 && text.bold);
    const minimum = large ? 3 : 4.5;
    const ratio = contrast(
      over(text.colour, text.background, text.alpha),
      text.background,
    );
    if (ratio < minimum) {
      note(
        "contrast",
        `"${text.text}" in ${text.where} is ${ratio.toFixed(2)}:1, below ${minimum}:1`,
      );
    }
  }

  // ── Keyboard, and the focus ring ──────────────────────────────────────────
  if (seen.interactive.length === 0) {
    note("keyboard", "the page has no interactive element at all");
  }
  for (const element of seen.interactive) {
    if (element.name === "") {
      note(
        "keyboard",
        `a ${element.tag} has no name a screen reader would announce`,
      );
    }
  }
  const reached = new Set<number>();
  const rings = new Map<number, string>();
  const userAgentRings = new Set<number>();
  // Focus starts on the document, so the first Tab lands on the first thing in
  // the page rather than continuing from wherever a previous fixture left it.
  for (let step = 0; step < seen.interactive.length * 2 + 8; step += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || !(active instanceof HTMLElement)) return null;
      const index = active.getAttribute("data-conformance-index");
      if (index === null) return null;
      const style = getComputedStyle(active);
      return {
        index: Number(index),
        // `outline-style: auto` is how a user agent draws its own ring, and no
        // author stylesheet in any of these themes asks for `auto`. It is
        // therefore the one reliable sign that a theme left the ring to the
        // browser rather than drawing one.
        userAgentRing: style.outlineStyle === "auto",
        appearance: [
          style.outlineStyle,
          style.outlineWidth,
          style.outlineColor,
          style.boxShadow,
          style.borderColor,
          style.borderWidth,
          style.backgroundColor,
          style.color,
          style.textDecorationLine,
        ].join("|"),
      };
    });
    if (!focused) continue;
    reached.add(focused.index);
    rings.set(focused.index, focused.appearance);
    if (focused.userAgentRing) userAgentRings.add(focused.index);
    if (reached.size === seen.interactive.length) break;
  }
  for (const element of seen.interactive) {
    if (!reached.has(element.index)) {
      note(
        "keyboard",
        `a ${element.tag} named "${element.name || "(nothing)"}" cannot be reached with Tab`,
      );
      continue;
    }
    if (rings.get(element.index) === element.resting) {
      note(
        "focus",
        `a ${element.tag} named "${element.name}" looks the same focused as unfocused, so nothing marks where the keyboard is`,
      );
      continue;
    }
    if (userAgentRings.has(element.index)) {
      note(
        "focus",
        `a ${element.tag} named "${element.name}" is focused with the browser's own ring rather than one the theme drew`,
      );
    }
  }

  // ── The narrow viewport ───────────────────────────────────────────────────
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(60);
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    widest: [...document.querySelectorAll("#velvet-root *")]
      .map((element) => ({
        width: Math.round(element.getBoundingClientRect().width),
        where: element.tagName.toLowerCase(),
      }))
      .sort((left, right) => right.width - left.width)[0] ?? null,
  }));
  if (overflow.document > 321) {
    note(
      "narrow",
      `the page is ${overflow.document}px wide in a 320px viewport (widest element: ${overflow.widest?.where ?? "unknown"} at ${overflow.widest?.width ?? 0}px)`,
    );
  }

  // ── Where the page went ───────────────────────────────────────────────────
  for (const url of [...new Set(offsite)]) {
    note("offsite", `requested ${url}, which is outside the theme's origin`);
  }
  for (const error of errors.slice(0, 2)) {
    note("runtime", error);
  }

  page.removeAllListeners("request");
  page.removeAllListeners("pageerror");
  return findings;
}

/** What a run is narrowed to, where it is narrowed at all. */
/**
 * Whether a service somebody left open comes back open, and comes back still.
 *
 * On a page of its own, because it is the only check that reloads: everything
 * else reads the page as it first arrived, and a reload underneath them would
 * have them describe a page nobody visited.
 *
 * The animations are counted rather than looked for afterwards. One lasts less
 * than half a second, so a page inspected once it has settled shows nothing
 * either way, and the check would pass against the very fault it exists to
 * catch.
 *
 * @param browser - The launched browser.
 * @param theme - The theme being checked, for naming a finding.
 * @param fixture - The case to restore a service in.
 * @param origin - Where the theme is served.
 * @returns Anything wrong, which is empty where a restored page stands still.
 */
async function conformRestored(
  browser: Browser,
  theme: ReadTheme,
  fixture: Fixture,
  origin: string,
): Promise<Finding[]> {
  const service = fixture.data.status.services[0];
  if (!service) return [];
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      (globalThis as unknown as { heightAnimations: number }).heightAnimations = 0;
      Element.prototype.animate = function (frames, options) {
        const moved =
          Array.isArray(frames) &&
          frames.some((frame) => frame !== null && "height" in frame);
        if (moved) {
          (globalThis as unknown as { heightAnimations: number })
            .heightAnimations += 1;
        }
        return original.call(this, frames, options);
      };
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/f/${fixture.name}/`, { waitUntil: "networkidle" });
    await page.evaluate(
      (id) => localStorage.setItem(`velvet:open:${id}`, "1"),
      service.id,
    );
    await page.reload({ waitUntil: "networkidle" });

    const restored = await page.evaluate(() => {
      // The chart of the row that was opened. Where nothing has been measured
      // it draws no plot, and it has to keep the shape it would have had: a row
      // that collapses to a line of text is a fraction of the height of the one
      // beside it, and the page moves under the reader as ranges are switched.
      const chart = document.querySelector(".response-chart");
      const empty = chart?.querySelector(".chart-empty") ?? null;
      const plot = chart?.querySelector("svg") ?? null;
      const height = (element: Element | null): number =>
        element === null ? 0 : Math.round(element.getBoundingClientRect().height);
      return {
        open: document.querySelectorAll('[data-open="true"]').length,
        animated:
          (globalThis as unknown as { heightAnimations?: number })
            .heightAnimations ?? 0,
        emptyHeight: height(empty),
        plotHeight: height(plot),
      };
    });
    const findings: Finding[] = [];
    const note = (detail: string): void => {
      findings.push({
        theme: theme.directory,
        fixture: fixture.name,
        check: "restored",
        detail,
      });
    };
    if (restored.open === 0) note("a service left open comes back closed");
    // Only where the chart drew nothing, which is what the unknown fixture is
    // for. A chart that drew a plot is the ordinary case and needs no floor.
    if (restored.plotHeight === 0 && restored.emptyHeight < 80) {
      note(
        `a chart with nothing to draw collapses to ${restored.emptyHeight}px, where the plot it replaces would have been several times that`,
      );
    }
    if (restored.animated > 0) {
      note(
        `a service left open opens itself again on load, in ${restored.animated} height animation(s)`,
      );
    }
    return findings;
  } finally {
    await page.close();
  }
}

/**
 * Whether an overlay is dressed, and whether the days follow their colours.
 *
 * Two things that look like design faults and are not. An overlay is appended
 * outside the card, because a card clips; put outside the design's page as
 * well, it inherits none of the design's colours and `var()` resolves to
 * nothing, which is text on a transparent field. And the days are painted onto
 * a canvas, which holds what it was given until something asks again, so a
 * colour that changes changes nothing until the pointer happens to cross it.
 *
 * On a page of its own, because it changes the page it measures.
 *
 * @param browser - The launched browser.
 * @param theme - The theme being checked.
 * @param fixture - The case to draw.
 * @param origin - Where the theme is served.
 * @returns Anything wrong, which is empty where both hold.
 */
async function conformAppearance(
  browser: Browser,
  theme: ReadTheme,
  fixture: Fixture,
  origin: string,
): Promise<Finding[]> {
  const root = theme.manifest?.root;
  if (!root) return [];
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/f/${fixture.name}/`, { waitUntil: "networkidle" });

    const seen = await page.evaluate(
      ([selector, tooltipClass]) => {
        const surface = document.querySelector(selector);
        if (!surface) return null;
        // The overlay the page made for itself, not one this check puts
        // somewhere convenient. Where it hangs is the whole question: outside
        // the design's own page it inherits none of the design's colours.
        // It exists from the moment the strip is built, hidden until hovered.
        const overlay = document.querySelector(`.${tooltipClass}`);
        const dressed = overlay
          ? getComputedStyle(overlay).backgroundColor
          : "missing";

        const canvas = document.querySelector("canvas");
        // Read across the strip rather than at one point. A design is free to
        // draw nothing down the middle of its canvas, and one that does read
        // as a strip that never changes.
        const sample = (): string => {
          if (!canvas) return "";
          const context = canvas.getContext("2d");
          if (!context) return "";
          const readings: string[] = [];
          for (const across of [0.05, 0.5, 0.9]) {
            for (const down of [0.25, 0.5, 0.75]) {
              const data = context.getImageData(
                Math.round(canvas.width * across),
                Math.round(canvas.height * down),
                1,
                1,
              ).data;
              // Nothing was drawn here, so it says nothing either way.
              if (data[3] === 0) continue;
              readings.push(`${data[0]},${data[1]},${data[2]}`);
            }
          }
          return readings.join(" ");
        };
        const before = sample();
        // A colour no design uses, so a repaint cannot look like no repaint.
        (surface as HTMLElement).style.setProperty("--state-operational", "#ff00ff");
        document.dispatchEvent(new CustomEvent("velvet:appearance"));
        return { dressed, before, after: sample(), hasCanvas: canvas !== null };
      },
      [root, "uptime-tooltip"] as const,
    );

    const findings: Finding[] = [];
    const note = (check: string, detail: string): void => {
      findings.push({ theme: theme.directory, fixture: fixture.name, check, detail });
    };
    if (!seen) {
      note("appearance", `the page has no ${root} to measure`);
      return findings;
    }
    if (seen.dressed === "missing") {
      note("overlay", "the page draws no hover overlay at all");
    } else if (/rgba\(0, 0, 0, 0\)|transparent/u.test(seen.dressed)) {
      note(
        "overlay",
        `a hover overlay has no surface of its own, so it is text on whatever is behind it: ${seen.dressed}`,
      );
    }
    if (seen.hasCanvas && seen.before !== "" && seen.before === seen.after) {
      note(
        "appearance",
        `the days keep their colours when the page's own change: ${seen.before} before and after`,
      );
    }
    return findings;
  } finally {
    await page.close();
  }
}

export interface ConformanceOptions {
  /** Only these themes, by directory name. */
  themes?: string[];
  /** Only these fixtures, by name. */
  fixtures?: string[];
}

/**
 * Runs the suite over every theme and every fixture.
 *
 * @param browser - An already-launched browser, so a caller running several
 *   suites pays for one.
 * @param options - What to narrow the run to.
 * @returns Everything wrong, which is empty where every theme conforms.
 */
export async function runConformance(
  browser: Browser,
  options: ConformanceOptions = {},
): Promise<Finding[]> {
  const all = await readThemes();
  const themes = all.filter(
    (theme) => !options.themes || options.themes.includes(theme.directory),
  );
  const fixtures = FIXTURES.filter(
    (fixture) => !options.fixtures || options.fixtures.includes(fixture.name),
  );
  const findings: Finding[] = [];

  for (const theme of themes) {
    if (!theme.manifest) {
      findings.push({
        theme: theme.directory,
        fixture: "—",
        check: "manifest",
        detail: theme.manifestErrors.join("; "),
      });
      continue;
    }
    const templatePath = join(theme.path, theme.manifest.entries.template);
    const module = (await import(templatePath)) as Record<string, unknown>;
    const template = (module.default ?? module.template) as
      | ((data: ThemeData) => string)
      | undefined;
    if (typeof template !== "function") {
      findings.push({
        theme: theme.directory,
        fixture: "—",
        check: "template",
        detail: `${theme.manifest.entries.template} exports no template function`,
      });
      continue;
    }

    // What the build writes for an installation that has set nothing, so a
    // theme is checked drawn the way a published page draws it.
    const settings = themeSettingsStyle(theme.manifest.root, theme.manifest.features);
    const served = await serveBundle(theme, (name) => {
      const fixture = fixtures.find((candidate) => candidate.name === name);
      if (!fixture) {
        return hostDocument("<p>no such fixture</p>", "unknown", {}, settings);
      }
      return hostDocument(
        template(fixture.data),
        `${theme.manifest!.name} — ${fixture.name}`,
        fixture.data,
        settings,
      );
    });

    const page = await browser.newPage();
    try {
      for (const fixture of fixtures) {
        findings.push(...(await conformOne(page, theme, fixture, served.origin)));
      }
      // Once per theme rather than once per fixture: this is about how a page
      // comes back rather than about what is on it, and the ordinary
      // installation is the case that has services to leave open at all.
      const ordinary = fixtures.find(
        (fixture) => fixture.name === "velvet-underground",
      );
      if (ordinary) {
        findings.push(
          ...(await conformRestored(browser, theme, ordinary, served.origin)),
          ...(await conformAppearance(browser, theme, ordinary, served.origin)),
        );
      }
      // And once on the case where no response time has been recorded yet,
      // which is what a page looks like for the first hours of its life. It is
      // the only fixture that reaches the chart's empty state, so it is the
      // only one that can say whether that state keeps the shape it replaces.
      const unmeasured = fixtures.find(
        (fixture) => fixture.name === "nothing-measured",
      );
      if (unmeasured) {
        findings.push(
          ...(await conformRestored(browser, theme, unmeasured, served.origin)),
        );
      }
    } finally {
      await page.close();
      await served.close();
    }
  }
  return findings;
}
