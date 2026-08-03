/**
 * Browser entry for the configuration reference page.
 *
 * Prerendered like the start page and the changelog, and unlike the references
 * page. What it shows comes from a file in this repository, so there is nothing
 * to read at request time and nothing a visitor gains from running code to see
 * it. The script is removed from the published output.
 */
import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import { runPageScriptWhilstDeveloping } from "../lib/run-page-script.js";

import "../app.css";
import "../website/website.css";
import Documentation from "./Documentation.svelte";

const target = document.querySelector<HTMLElement>("#documentation");
if (!target) throw new Error("Documentation mount point not found.");

mount(Documentation, { target });

runPageScriptWhilstDeveloping();
