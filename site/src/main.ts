import { hydrate, mount } from "svelte";
// Bundled rather than fetched from a CDN, which is how the three tools already
// load it. A generated status page is somebody else's deployment, so an icon
// set it has to reach unpkg for is an outage waiting to happen on their site,
// and it arrives as the complete face rather than the subset built here.
import "@phosphor-icons/web/duotone";
import "./app.css";
import App from "./App.svelte";
import { readInitialState } from "./lib/initial-state";

/**
 * Front-end entry point. Brings the status page to life inside #app.
 *
 * The build renders the page and writes the state it rendered from into the
 * document, so what arrives is readable before this runs. That markup is
 * adopted rather than replaced, and the page then refreshes itself from the
 * repository as it always did.
 *
 * A document carrying no prerendered state is mounted from empty instead. That
 * is what a page built before this existed looks like, and it still works.
 */
const target = document.getElementById("app");
if (!target) throw new Error("Missing #app mount node");

const initial = readInitialState(document);

export default initial
  ? hydrate(App, { target, props: { initial } })
  : mount(App, { target });
