/**
 * Browser entry for the attributions page.
 *
 * Prerendered, like the start page and the changelog. What it shows comes from
 * a file in this repository, so there is nothing to read at request time.
 */
import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import "../app.css";
import "../website/website.css";
import Attributions from "./Attributions.svelte";

const target = document.querySelector<HTMLElement>("#attributions");
if (!target) throw new Error("Attributions mount point not found.");

mount(Attributions, { target });
