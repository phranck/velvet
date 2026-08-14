/**
 * The four rules that keep a bundle from reaching outside itself, as functions
 * over the files a bundle contains.
 *
 * A bundle is redundant on purpose: it borrows nothing and works on its own.
 * That only holds if it cannot quietly acquire a dependency, which is what these
 * rules are for and why each of them is checked rather than stated.
 *
 *   1. **Self-contained.** Every `url()`, `import` and `src` resolves inside the
 *      bundle. Nothing points at another bundle, at the site, or at a remote
 *      host. The foundation is the one exception: a theme imports what it needs
 *      from it and the build writes that code into the theme.
 *   2. **Fonts ship with the bundle.** A published status page must not wait on
 *      a third party in order to report on its own availability, and a German
 *      operator should not be made to send their visitors to a font host
 *      without having chosen to.
 *   3. **Styles stay inside the bundle's own root.** No selectors on `html`,
 *      `body`, `:root` or `*`, and no `!important`, so two designs cannot fight
 *      over the document and a preview frame renders one design rather than a
 *      mixture.
 *   4. **Data is given, not fetched.** The host loads the data, validates it and
 *      hands the bundle a typed object. A bundle makes no request of its own.
 *
 * Everything here works on text rather than on a browser, so the gate runs
 * before anything is built. What a browser resolved is the conformance suite's
 * question, not this one.
 */

import { MANIFEST_FILE, type BundleManifest } from "./manifest.js";

/** The rules, named the way a failure reports them. */
export type BundleRule =
  | "self-contained"
  | "fonts"
  | "style-scope"
  | "no-fetching"
  | "manifest";

/** One thing wrong with a bundle, and where. */
export interface BundleViolation {
  rule: BundleRule;
  /** The file it was found in, relative to the bundle directory. */
  file: string;
  detail: string;
}

/** A file inside a bundle, as the gate reads it. */
export interface BundleFile {
  /** Relative to the bundle directory, with forward slashes. */
  path: string;
  text: string;
}

/**
 * The specifier prefix a bundle imports the foundation through.
 *
 * Anything under it is allowed and nothing else is. A theme does not declare
 * which parts it uses, because it imports them and the build bundles them in,
 * so there is no list to check a specifier against.
 */
export const FOUNDATION_SPECIFIER_PREFIX = "@velvet/foundation/";

/** Hosts a design must not fetch a typeface from, named because all six did. */
const FONT_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "use.typekit.net",
  "fonts.bunny.net",
  "cdn.jsdelivr.net",
];

/** Everything that opens a connection, which a bundle never does. */
const NETWORK_CALLS = [
  { pattern: /\bfetch\s*\(/, name: "fetch()" },
  { pattern: /\bXMLHttpRequest\b/, name: "XMLHttpRequest" },
  { pattern: /\bWebSocket\b/, name: "WebSocket" },
  { pattern: /\bEventSource\b/, name: "EventSource" },
  { pattern: /\bsendBeacon\s*\(/, name: "navigator.sendBeacon()" },
  { pattern: /\bimportScripts\s*\(/, name: "importScripts()" },
];

/** Removes CSS comments, so prose about a font host is not mistaken for one. */
function withoutCssComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Removes script comments.
 *
 * Block comments go wholesale. A line comment is only recognised where the two
 * slashes are not preceded by a colon, because `"https://…"` inside a string is
 * not a comment and blanking the rest of that line would hide the very thing
 * this gate is looking for.
 */
function withoutScriptComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** True for a path that names something outside the bundle it lives in. */
function escapesBundle(fromFile: string, target: string): boolean {
  const directory = fromFile.includes("/")
    ? fromFile.slice(0, fromFile.lastIndexOf("/"))
    : "";
  const parts = directory === "" ? [] : directory.split("/");
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return true;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return false;
}

/**
 * Classifies one reference a file makes.
 *
 * @param fromFile - The file the reference was found in.
 * @param target - Whatever the `url()`, `import` or `src` named.
 * @returns Why it is not allowed, or null where it resolves inside the bundle.
 */
function referenceProblem(fromFile: string, target: string): string | null {
  const value = target.trim();
  if (value === "") return "an empty reference";
  // Inline payloads are the bundle's own bytes, however large.
  if (value.startsWith("data:") || value.startsWith("blob:")) return null;
  // A fragment addresses this very document.
  if (value.startsWith("#")) return null;
  if (value.startsWith("//")) return "a protocol-relative remote reference";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "a remote reference";
  if (value.startsWith("/")) return "an absolute path, which leaves the bundle";
  if (escapesBundle(fromFile, value)) return "a path that leaves the bundle";
  return null;
}

/** Every `url()` and `@import` in a stylesheet, with what it named. */
function styleReferences(css: string): string[] {
  const found: string[] = [];
  for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
    found.push(match[2] ?? "");
  }
  for (const match of css.matchAll(
    /@import\s+(?:url\(\s*(['"]?)([^'")]*)\1\s*\)|(['"])([^'"]*)\3)/g,
  )) {
    found.push(match[2] ?? match[4] ?? "");
  }
  return found;
}

/** Every specifier a module loads at run time, ignoring the type-only ones. */
function scriptSpecifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    // `import x from "y"`, `import "y"`, but never `import type … from "y"`.
    /(?:^|[\s;}])import\s+(?!type[\s{])(?:[^'"]*?\sfrom\s*)?["']([^"']+)["']/g,
    /(?:^|[\s;}])export\s+(?!type[\s{])[^'"]*?\sfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bnew\s+URL\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]!);
  }
  return found;
}

/** Every `src` a template writes into its markup. */
function markupSources(source: string): string[] {
  return [...source.matchAll(/\bsrc\s*=\s*["']([^"'${}]+)["']/g)].map(
    (match) => match[1]!,
  );
}

/**
 * Rule 1, for one file.
 *
 * @param file - The file to read.
 * @returns Everything the file reaches for that it may not.
 */
export function checkSelfContained(file: BundleFile): BundleViolation[] {
  const violations: BundleViolation[] = [];
  const isStyle = file.path.endsWith(".css");
  const text = isStyle
    ? withoutCssComments(file.text)
    : withoutScriptComments(file.text);

  const references = isStyle
    ? styleReferences(text)
    : [...scriptSpecifiers(text), ...markupSources(text)];

  for (const reference of references) {
    if (!isStyle && reference.startsWith(FOUNDATION_SPECIFIER_PREFIX)) {
      continue;
    }
    if (!isStyle && !reference.startsWith(".") && !/^[a-z][a-z0-9+.-]*:/i.test(reference)) {
      violations.push({
        rule: "self-contained",
        file: file.path,
        detail: `imports "${reference}", which is neither inside the bundle nor part of the foundation`,
      });
      continue;
    }
    const problem = referenceProblem(file.path, reference);
    if (problem) {
      violations.push({
        rule: "self-contained",
        file: file.path,
        detail: `${problem}: ${reference}`,
      });
    }
  }
  return violations;
}

/**
 * Rule 2, for one file.
 *
 * A typeface is either shipped in the bundle or not used. Both halves are
 * checked: no known font host anywhere, and no `@font-face` whose source leaves
 * the bundle.
 */
export function checkFonts(file: BundleFile): BundleViolation[] {
  const violations: BundleViolation[] = [];
  const text = file.path.endsWith(".css")
    ? withoutCssComments(file.text)
    : withoutScriptComments(file.text);

  for (const host of FONT_HOSTS) {
    if (text.includes(host)) {
      violations.push({
        rule: "fonts",
        file: file.path,
        detail: `fetches a typeface from ${host}; a bundle ships the faces it names`,
      });
    }
  }
  for (const block of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    for (const source of styleReferences(block[1] ?? "")) {
      const problem = referenceProblem(file.path, source);
      if (problem) {
        violations.push({
          rule: "fonts",
          file: file.path,
          detail: `a @font-face source is ${problem}: ${source}`,
        });
      }
    }
  }
  return violations;
}

/**
 * Rule 3, for one stylesheet.
 *
 * The selectors are read out of the rule preludes rather than searched for as
 * words, because `body` appears inside `.status-body` and a word search would
 * report it.
 */
export function checkStyleScope(file: BundleFile): BundleViolation[] {
  if (!file.path.endsWith(".css")) return [];
  const violations: BundleViolation[] = [];
  const css = withoutCssComments(file.text);

  if (/!\s*important/.test(css)) {
    violations.push({
      rule: "style-scope",
      file: file.path,
      detail: "uses !important, which reaches past whatever the host set",
    });
  }

  for (const match of css.matchAll(/(^|[};])([^{};]+)\{/g)) {
    const prelude = (match[2] ?? "").trim();
    if (prelude === "" || prelude.startsWith("@")) continue;
    for (const selector of prelude.split(",")) {
      const trimmed = selector.trim();
      if (trimmed === "") continue;
      // The first compound is what decides the scope; a descendant further
      // along is already inside whatever the first one matched.
      const head = trimmed.split(/[\s>+~]+/)[0]!;
      // The universal selector is matched on its own, because `\b` after `*`
      // never holds: there is no word character on either side of it.
      const named = head.startsWith("*")
        ? "*"
        : head.match(/^(html|body|:root)\b/i)?.[1];
      if (named) {
        violations.push({
          rule: "style-scope",
          file: file.path,
          detail: `styles "${named}" in "${trimmed}"; a bundle styles only its own root and what is inside it`,
        });
      }
    }
  }
  return violations;
}

/** Rule 4, for one script. */
export function checkNoFetching(file: BundleFile): BundleViolation[] {
  if (file.path.endsWith(".css")) return [];
  const violations: BundleViolation[] = [];
  const source = withoutScriptComments(file.text);
  for (const { pattern, name } of NETWORK_CALLS) {
    if (pattern.test(source)) {
      violations.push({
        rule: "no-fetching",
        file: file.path,
        detail: `calls ${name}; the host loads the data and hands it over`,
      });
    }
  }
  return violations;
}

/** Everything a bundle needs before its files are worth reading. */
export interface BundleContents {
  /** The parsed manifest. */
  manifest: BundleManifest;
  /** The directory name the bundle lives in, which is its identifier. */
  directory: string;
  /** Every file in the bundle, manifest included. */
  files: BundleFile[];
}

/**
 * Runs all four rules over a bundle, plus the manifest checks that need the
 * files to be present.
 *
 * @param contents - The bundle, already read off disk.
 * @returns Every violation, in file order.
 */
export function checkBundle(contents: BundleContents): BundleViolation[] {
  const { manifest, files } = contents;
  const violations: BundleViolation[] = [];
  const present = new Set(files.map((file) => file.path));

  // The identifier is the directory rather than a field, so the two cannot
  // disagree and there is nothing here to check about it.
  for (const named of [
    manifest.entries.template,
    manifest.entries.styles,
    manifest.entries.script,
  ]) {
    if (named !== "" && !present.has(named)) {
      violations.push({
        rule: "manifest",
        file: MANIFEST_FILE,
        detail: `names ${named}, which the bundle does not contain`,
      });
    }
  }

  for (const file of files) {
    if (file.path === MANIFEST_FILE) continue;
    violations.push(
      ...checkSelfContained(file),
      ...checkFonts(file),
      ...checkStyleScope(file),
      ...checkNoFetching(file),
    );
  }
  return violations;
}
