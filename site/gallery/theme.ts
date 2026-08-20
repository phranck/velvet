/**
 * One theme, rendered into a document of its own.
 *
 * The gallery opens one of these per theme, in a frame each, which is what
 * makes "one document carries one theme" true by construction rather than by
 * convention. Nothing is shared between two frames, so a theme that declared
 * something reaching past its own root could still only reach its own page.
 *
 * The stylesheet is linked rather than inlined, because a theme's typefaces and
 * pictures are addressed relative to it and a frame written as `srcdoc` has no
 * address for them to resolve against. This is also how a published page loads
 * it, so what the gallery shows is what an installation would get.
 */

import { FIXTURES, fixtureNamed } from "../theme-bundles/fixtures/index.js";
import { themeSettingsStyle } from "../src/lib/themes/settings.js";
import { installedTheme } from "../src/lib/themes/installed.js";

const parameters = new URLSearchParams(window.location.search);
const wanted = parameters.get("theme") ?? "";
const theme = installedTheme(wanted);
const fixture = fixtureNamed(parameters.get("fixture") ?? "") ?? FIXTURES[0]!;

const root = document.querySelector<HTMLElement>("#velvet-root");
if (!root) throw new Error("No #velvet-root to render into.");

if (!theme) {
  root.textContent = `No theme called "${wanted}".`;
} else {
  document.title = `${theme.manifest.name} — ${fixture.name}`;

  /*
    The stylesheet is waited for rather than merely added.

    A published page carries its `<link>` in the document it is served as, so
    the theme is in its own colours before a line of script runs. Here the link
    is added by script, and rendering without waiting would show the first frame
    of every theme undressed.
  */
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = `/theme-bundles/${theme.manifest.id}/${theme.manifest.entries.styles}`;
  const applied = new Promise<void>((resolve) => {
    stylesheet.addEventListener("load", () => resolve());
    stylesheet.addEventListener("error", () => resolve());
  });
  document.head.append(stylesheet);
  // What the build would write for an installation that has set nothing, so the
  // gallery shows a theme drawn the way a published page draws it.
  const settings = themeSettingsStyle(theme.manifest.root, theme.manifest.features);
  if (settings !== "") {
    document.head.insertAdjacentHTML("beforeend", settings);
  }
  await applied;

  // The layout the theme supports rather than the one the fixture configured:
  // a layout a theme cannot draw is not a layout.
  const data = {
    ...fixture.data,
    site: {
      ...fixture.data.site,
      layout: theme.manifest.layouts.includes(fixture.data.site.layout)
        ? fixture.data.site.layout
        : theme.manifest.layouts[0]!,
    },
  };

  /*
    The markup is parsed rather than assembled, because a bundle's template
    returns a string: the same function has to run in the build, which has no
    DOM, and here, which has one.

    Nothing untrusted is parsed. The string comes from a template in this
    repository, and every value it takes from the data goes through that
    theme's own escaping before it reaches the markup.
  */
  root.append(document.createRange().createContextualFragment(theme.template(data)));
  theme.script(root, data);
}
