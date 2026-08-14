/**
 * The conformance suite: one set of questions asked of every bundle, about what
 * it rendered rather than about how it was built.
 *
 * This is what replaces the property contract. Two gates used to check that 418
 * named custom properties existed and resolved, which says nothing about
 * whether the page is right: a design can declare every property in the set and
 * still print last week's uptime beside a service nobody can reach with a
 * keyboard.
 *
 * What it asserts, against every fixture, for every bundle:
 *
 *   - Every service's name appears, and beside it its uptime figure for the
 *     chosen range. The figure is compared against what the shared arithmetic
 *     computes from the same fixture, so a bundle that does its own arithmetic
 *     and gets it wrong fails here. That is what makes the redundancy between
 *     bundles safe.
 *   - Every visible incident appears with its title.
 *   - The version, the serial number and the line naming where the page is
 *     configured all appear.
 *   - Exactly one `h1`.
 *   - Every interactive element is reachable by keyboard and has a name a
 *     screen reader announces.
 *   - Nothing overflows the viewport at 320px.
 *   - Text meets its contrast: 4.5:1 for body, 3:1 for large text.
 *   - No request leaves the bundle's own origin.
 *   - The focus ring is the design's own and never the browser's default.
 *
 * The bundle is served over a real HTTP origin rather than pushed into a blank
 * document, because a design's own assets have to resolve the way they will
 * when it is published, and because "no request leaves this origin" is only a
 * question worth asking of a page that has one.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { Browser, Page } from "playwright";

import type { BundleData } from "../src/lib/bundles/data.js";
import { uptimeForRange, visibleIncidentEvents } from "../src/lib/data.js";
import { FIXTURES, type Fixture } from "../bundles/fixtures/index.js";
import { readBundles, type ReadBundle } from "./bundles.js";

/** One thing a bundle got wrong, named the way a person can act on it. */
export interface Finding {
  bundle: string;
  fixture: string;
  check: string;
  detail: string;
}

/** Content types for everything a bundle can serve. */
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
 * The document a bundle is rendered into.
 *
 * The host owns everything outside the root element: the document language, the
 * viewport, and the element the markup goes into. A bundle owns what is inside
 * it, which is why the page below carries no styling of its own beyond removing
 * the default margin the user agent puts on the body.
 */
function hostDocument(markup: string, title: string, data: unknown): string {
  // The data rides in the document rather than being fetched, because the
  // bundle is forbidden from fetching and the host has it already. The escape
  // is the one that matters: a service name containing `</script>` would
  // otherwise end the element early.
  const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="/bundle.css" />
    <style>
      body { margin: 0; }
    </style>
  </head>
  <body>
    <div id="velvet-root">${markup}</div>
    <script type="application/json" id="velvet-data">${payload}</script>
    <script type="module" src="/bundle.js"></script>
  </body>
</html>`;
}

/** A bundle, built and served, ready to be rendered against any fixture. */
interface ServedBundle {
  origin: string;
  close: () => Promise<void>;
}

/**
 * Builds a bundle's script and serves the whole directory over HTTP.
 *
 * The script is bundled rather than served as TypeScript because a browser
 * cannot load TypeScript, and the point of the exercise is what a browser did.
 * Everything the bundle references resolves against this origin, so a reference
 * that left the bundle shows up as a request to somewhere else.
 */
async function serveBundle(
  bundle: ReadBundle,
  render: (fixture: string) => string,
): Promise<ServedBundle> {
  const manifest = bundle.manifest!;
  const workspace = await mkdtemp(join(tmpdir(), "velvet-conformance-"));
  const entry = join(workspace, "entry.ts");
  await writeFile(
    entry,
    `import script from ${JSON.stringify(join(bundle.path, manifest.entries.script))};\n` +
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
      `${bundle.directory}: the script does not build: ${built.logs.join("\n")}`,
    );
  }
  const script = await built.outputs[0]!.text();

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname);
      if (path === "/bundle.js") {
        return new Response(script, {
          headers: { "content-type": CONTENT_TYPES[".js"]! },
        });
      }
      if (path === "/bundle.css") {
        return new Response(
          await readFile(join(bundle.path, manifest.entries.styles)),
          { headers: { "content-type": CONTENT_TYPES[".css"]! } },
        );
      }
      const fixture = path.match(/^\/f\/([a-z0-9-]+)\/?$/);
      if (fixture) {
        return new Response(render(fixture[1]!), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      // Anything else is one of the bundle's own files, addressed the way its
      // stylesheet addresses it.
      if (path.includes("..")) return new Response("no", { status: 400 });
      try {
        const file = Bun.file(join(bundle.path, path.replace(/^\//, "")));
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
 * round trip and there are eight bundles times eight fixtures of them.
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
function reference(data: BundleData): {
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

/** Runs every check against one bundle rendered from one fixture. */
async function conformOne(
  page: Page,
  bundle: ReadBundle,
  fixture: Fixture,
  origin: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const note = (check: string, detail: string): void => {
    findings.push({ bundle: bundle.directory, fixture: fixture.name, check, detail });
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
        // author stylesheet in any of these designs asks for `auto`. It is
        // therefore the one reliable sign that a design left the ring to the
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
        `a ${element.tag} named "${element.name}" is focused with the browser's own ring rather than one the design drew`,
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
    note("offsite", `requested ${url}, which is outside the bundle's origin`);
  }
  for (const error of errors.slice(0, 2)) {
    note("runtime", error);
  }

  page.removeAllListeners("request");
  page.removeAllListeners("pageerror");
  return findings;
}

/** What a run is narrowed to, where it is narrowed at all. */
export interface ConformanceOptions {
  /** Only these bundles, by directory name. */
  bundles?: string[];
  /** Only these fixtures, by name. */
  fixtures?: string[];
}

/**
 * Runs the suite over every bundle and every fixture.
 *
 * @param browser - An already-launched browser, so a caller running several
 *   suites pays for one.
 * @param options - What to narrow the run to.
 * @returns Everything wrong, which is empty where every bundle conforms.
 */
export async function runConformance(
  browser: Browser,
  options: ConformanceOptions = {},
): Promise<Finding[]> {
  const all = await readBundles();
  const bundles = all.filter(
    (bundle) => !options.bundles || options.bundles.includes(bundle.directory),
  );
  const fixtures = FIXTURES.filter(
    (fixture) => !options.fixtures || options.fixtures.includes(fixture.name),
  );
  const findings: Finding[] = [];

  for (const bundle of bundles) {
    if (!bundle.manifest) {
      findings.push({
        bundle: bundle.directory,
        fixture: "—",
        check: "manifest",
        detail: bundle.manifestErrors.join("; "),
      });
      continue;
    }
    const templatePath = join(bundle.path, bundle.manifest.entries.template);
    const module = (await import(templatePath)) as Record<string, unknown>;
    const template = (module.default ?? module.template) as
      | ((data: BundleData) => string)
      | undefined;
    if (typeof template !== "function") {
      findings.push({
        bundle: bundle.directory,
        fixture: "—",
        check: "template",
        detail: `${bundle.manifest.entries.template} exports no template function`,
      });
      continue;
    }

    const served = await serveBundle(bundle, (name) => {
      const fixture = fixtures.find((candidate) => candidate.name === name);
      if (!fixture) return hostDocument("<p>no such fixture</p>", "unknown", {});
      return hostDocument(
        template(fixture.data),
        `${bundle.manifest!.name} — ${fixture.name}`,
        fixture.data,
      );
    });

    const page = await browser.newPage();
    try {
      for (const fixture of fixtures) {
        findings.push(...(await conformOne(page, bundle, fixture, served.origin)));
      }
    } finally {
      await page.close();
      await served.close();
    }
  }
  return findings;
}
