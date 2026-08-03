import { mount } from "svelte";
// Bundled rather than fetched from a CDN, which is how the three tools already
// load it. A generated status page is somebody else's deployment, so an icon
// set it has to reach unpkg for is an outage waiting to happen on their site,
// and it arrives as the complete face rather than the subset built here.
import "@phosphor-icons/web/duotone";
import "./app.css";
import App from "./App.svelte";

/**
 * Front-end entry point. Mounts the status page into #app.
 * Validated Velvet documents are fetched client-side at runtime, so the deployed
 * static bundle stays current as repository data is refreshed.
 */
const target = document.getElementById("app");
if (!target) throw new Error("Missing #app mount node");

export default mount(App, { target });
