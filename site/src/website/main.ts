/**
 * Browser entry for the website.
 *
 * This runs during development, where mounting the component gives hot module
 * replacement. It never runs in production: `vite.website.ts` renders the page
 * at build time and removes the script, since the page has nothing to do once
 * it is drawn. The module still matters to the build, because walking it is how
 * Vite finds the fonts, the icon face, and every component's styles for the
 * stylesheet that does ship.
 */
import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import { runPageScriptWhilstDeveloping } from "../lib/run-page-script.js";

import "../app.css";
import Website from "./Website.svelte";
import "./website.css";

const target = document.querySelector<HTMLElement>("#website");
if (!target) throw new Error("Website mount point not found.");

mount(Website, { target });

runPageScriptWhilstDeveloping();
