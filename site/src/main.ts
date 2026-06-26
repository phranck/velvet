import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

/**
 * Front-end entry point. Mounts the status page into #app.
 * Data is fetched client-side at runtime (see lib/data.ts), so the deployed
 * static bundle stays valid while Upptime keeps refreshing the underlying data.
 */
const target = document.getElementById("app");
if (!target) throw new Error("Missing #app mount node");

export default mount(App, { target });
