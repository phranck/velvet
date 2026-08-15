// The icon face, cut down by the build to the glyphs this repository names.
import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import Configurator from "./Configurator.svelte";
import "./configurator.css";

const target = document.querySelector<HTMLElement>("#configurator");
if (!target) throw new Error("Configurator mount point not found.");

mount(Configurator, { target });
