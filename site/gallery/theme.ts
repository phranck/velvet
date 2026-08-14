/**
 * One design, rendered into a document of its own.
 *
 * The gallery opens one of these per design, in a frame each, which is what
 * makes "one document carries one design" true by construction rather than by
 * convention. Nothing is shared between two frames, so a design that declared
 * something reaching past its own root could still only reach its own page.
 *
 * The stylesheet is linked rather than inlined, because a design's typefaces and
 * pictures are addressed relative to it and a frame written as `srcdoc` has no
 * address for them to resolve against. This is also how a published page loads
 * it, so what the gallery shows is what an installation would get.
 */

import { FIXTURES, fixtureNamed } from "../theme-bundles/fixtures/index.js";
import { installedTheme } from "../src/lib/themes/installed.js";

const parameters = new URLSearchParams(window.location.search);
const wanted = parameters.get("design") ?? "";
const design = installedTheme(wanted);
const fixture = fixtureNamed(parameters.get("fixture") ?? "") ?? FIXTURES[0]!;

const root = document.querySelector<HTMLElement>("#velvet-root");
if (!root) throw new Error("No #velvet-root to render into.");

if (!design) {
  root.textContent = `No design called "${wanted}".`;
} else {
  document.title = `${design.manifest.name} — ${fixture.name}`;

  /*
    The stylesheet is waited for rather than merely added.

    A published page carries its `<link>` in the document it is served as, so
    the design is in its own colours before a line of script runs. Here the link
    is added by script, and rendering without waiting would show the first frame
    of every design undressed.
  */
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = `/theme-bundles/${design.manifest.id}/${design.manifest.entries.styles}`;
  const applied = new Promise<void>((resolve) => {
    stylesheet.addEventListener("load", () => resolve());
    stylesheet.addEventListener("error", () => resolve());
  });
  document.head.append(stylesheet);
  await applied;

  // The layout the design supports rather than the one the fixture configured:
  // a layout a design cannot draw is not a layout.
  const data = {
    ...fixture.data,
    site: {
      ...fixture.data.site,
      layout: design.manifest.layouts.includes(fixture.data.site.layout)
        ? fixture.data.site.layout
        : design.manifest.layouts[0]!,
    },
  };

  /*
    The markup is parsed rather than assembled, because a bundle's template
    returns a string: the same function has to run in the build, which has no
    DOM, and here, which has one.

    Nothing untrusted is parsed. The string comes from a template in this
    repository, and every value it takes from the data goes through that
    design's own escaping before it reaches the markup.
  */
  root.append(document.createRange().createContextualFragment(design.template(data)));
  design.script(root, data);
}
