/**
 * Browser entry for the references page.
 *
 * Unlike the website, this one keeps its script in the published output. The
 * list is read from the setup service when somebody opens the page, because
 * baking it into a build would leave a withdrawn consent visible until the
 * website next happened to be rebuilt.
 */
import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import "../app.css";
import "../website/website.css";
import References from "./References.svelte";

const target = document.querySelector<HTMLElement>("#references");
if (!target) throw new Error("References mount point not found.");

mount(References, { target });
