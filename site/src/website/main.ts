import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import "../app.css";
import Website from "./Website.svelte";
import "./website.css";

const target = document.querySelector<HTMLElement>("#website");
if (!target) throw new Error("Website mount point not found.");

mount(Website, { target });
