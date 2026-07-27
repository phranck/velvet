import "@phosphor-icons/web/duotone";
import { mount } from "svelte";
import "../app.css";
import Configurator from "./Configurator.svelte";
import "./configurator.css";

const target = document.querySelector<HTMLElement>("#configurator");

if (!target) throw new Error("Configurator mount point not found.");

mount(Configurator, { target });
