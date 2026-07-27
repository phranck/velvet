import { mount } from "svelte";
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
