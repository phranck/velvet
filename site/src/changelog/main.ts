/**
 * Browser entry for the changelog page.
 *
 * Like the start page and unlike the references page, this one is prerendered
 * and its script is removed from the published output. The releases come from a
 * file in this repository, so there is nothing to read at request time and
 * nothing a visitor gains from running code to see them.
 */
import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import { runPageScriptWhilstDeveloping } from "../lib/run-page-script.js";

import "../app.css";
import "../website/website.css";
import Changelog from "./Changelog.svelte";

const target = document.querySelector<HTMLElement>("#changelog");
if (!target) throw new Error("Changelog mount point not found.");

mount(Changelog, { target });

runPageScriptWhilstDeveloping();
