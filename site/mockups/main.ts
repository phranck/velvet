/**
 * Entry point every mockup page loads.
 *
 * The stylesheets are deliberately not imported here. Each page links
 * `base.css` and one theme file in its own head, so the pair is visible in the
 * document and either can be swapped in developer tools without a rebuild.
 * That is the whole point of the exercise: if a theme had to be bundled, it
 * would not be a file somebody drops in.
 *
 * The icon face is imported the way `site/src/main.ts` imports it, so a mockup
 * shows the same glyphs a published page does rather than substitutes.
 */

import "@phosphor-icons/web/duotone";

import { mountStatusPage, previewOverallStatus } from "./page.js";
import type { ServiceStatus } from "../src/lib/types.js";

/** Every theme, in the order the toolbar lists them. */
const THEMES = [
  { file: "velvet.html", name: "Velvet", era: "today" },
  { file: "cassette.html", name: "Cassette Futurism", era: "1979" },
  { file: "populuxe.html", name: "Populuxe", era: "1958" },
  { file: "vector.html", name: "Vector Grid", era: "1982" },
  { file: "twenty-forty-nine.html", name: "Twenty Forty-Nine", era: "2049" },
  { file: "ncc-1701-d.html", name: "NCC-1701-D", era: "2364" },
];

/**
 * The bar above the page, which belongs to the mockup rather than to Velvet.
 *
 * Styled entirely from `base.css` under its own class prefix and untouched by
 * any theme, so it cannot be mistaken for part of the design under review.
 *
 * @param current - The file name of the page it is being built on, so that
 *   entry can be marked rather than linked to itself.
 * @param onLayoutChange - Called with the layout the visitor picked.
 * @param onStateChange - Called with the state the visitor picked.
 * @returns The bar, ready to be put at the top of the document.
 */
function buildToolbar(
  current: string,
  onLayoutChange: (layout: "grouped" | "cards") => void,
  onStateChange: (status: ServiceStatus) => void,
): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "mockup-bar";

  const label = document.createElement("span");
  label.className = "mockup-bar-label";
  label.textContent = "Velvet theme mockups";
  bar.append(label);

  const themes = document.createElement("nav");
  themes.className = "mockup-bar-themes";
  themes.setAttribute("aria-label", "Theme");
  for (const theme of THEMES) {
    if (theme.file === current) {
      const marked = document.createElement("span");
      marked.className = "mockup-bar-link is-current";
      marked.setAttribute("aria-current", "page");
      marked.textContent = `${theme.name} · ${theme.era}`;
      themes.append(marked);
      continue;
    }
    const link = document.createElement("a");
    link.className = "mockup-bar-link";
    link.href = theme.file;
    link.textContent = `${theme.name} · ${theme.era}`;
    themes.append(link);
  }
  bar.append(themes);

  // What the page announces, so the state colours can be reviewed. The fixture
  // reports an outage, and without this that is the only headline a theme
  // would ever be seen carrying.
  const states = document.createElement("div");
  states.className = "mockup-bar-group";
  states.setAttribute("role", "group");
  states.setAttribute("aria-label", "State");
  const STATES: ServiceStatus[] = [
    "operational",
    "degraded",
    "outage",
    "unknown",
  ];
  for (const state of STATES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mockup-bar-button";
    button.textContent = state;
    button.setAttribute(
      "aria-pressed",
      String(state === document.documentElement.dataset.status),
    );
    button.addEventListener("click", () => {
      for (const other of states.children) {
        other.setAttribute("aria-pressed", "false");
      }
      button.setAttribute("aria-pressed", "true");
      onStateChange(state);
    });
    states.append(button);
  }
  bar.append(states);

  const layouts = document.createElement("div");
  layouts.className = "mockup-bar-group";
  layouts.setAttribute("role", "group");
  layouts.setAttribute("aria-label", "Layout");
  // A design whose structure runs the height of the whole readout has no
  // notion of a panel per service, and says so with `--layout-cards: none`.
  const offered =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--layout-cards")
      .trim() === "none"
      ? (["grouped"] as const)
      : (["grouped", "cards"] as const);
  for (const layout of offered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mockup-bar-button";
    button.textContent = layout;
    button.setAttribute("aria-pressed", String(layout === "grouped"));
    button.addEventListener("click", () => {
      for (const other of layouts.children) {
        other.setAttribute("aria-pressed", "false");
      }
      button.setAttribute("aria-pressed", "true");
      onLayoutChange(layout);
    });
    layouts.append(button);
  }
  bar.append(layouts);

  return bar;
}

const mount = document.querySelector<HTMLElement>("#mockup");
if (!mount) {
  throw new Error("No #mockup element to render into.");
}

const current = window.location.pathname.split("/").pop() || "cassette.html";

// The page is mounted first, because the bar marks whichever state button the
// fixture produced and can only read that once the page has said what it is.
mountStatusPage(mount, "grouped");

/** The state the bar is showing, held so a layout change does not lose it. */
let previewed = document.documentElement.dataset.status as ServiceStatus;

document.body.prepend(
  buildToolbar(
    current,
    (layout) => {
      mountStatusPage(mount, layout);
      previewOverallStatus(previewed);
    },
    (status) => {
      previewed = status;
      previewOverallStatus(status);
    },
  ),
);
