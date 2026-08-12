// Read as text rather than imported as a module, which is what lets the file
// stay the plain script it has to be: it is written into a published document
// verbatim, so it may not carry an import, an export, or anything a bundler
// would have to resolve.
import pageScript from "./page-script.js?raw";

/**
 * Runs a published page's own script whilst that page is being developed.
 *
 * `prerenderStaticEntry` writes `page-script.js` into every document it renders
 * and removes the bundle those pages would otherwise carry, so on the published
 * site the script is there and this is not. The dev server does neither, so
 * nothing enabled a copy button and nothing marked the topic being read, and
 * both read as faults in the page rather than in how it was being served.
 *
 * It is delivered here the same way the prerender delivers it, as an inline
 * script appended to the document, so what runs whilst developing is the file
 * that ships rather than something arranged to resemble it.
 */
export function runPageScriptWhilstDeveloping(): void {
  if (!import.meta.env.DEV) return;

  const run = () => {
    const element = document.createElement("script");
    element.textContent = pageScript;
    document.body.append(element);
    element.remove();
  };

  run();

  // Again after every hot update. Svelte replaces the markup it owns, and the
  // controls this script enables come back disabled, which reads as a dead
  // button rather than as a page that has been re-rendered. The script wires
  // each control once and installs its document listeners once, so running it
  // again costs nothing.
  import.meta.hot?.on("vite:afterUpdate", run);
}
