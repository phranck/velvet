import "@phosphor-icons/web/duotone";
import { mount } from "svelte";

import "../app.css";
import Onboarding from "./Onboarding.svelte";
import "./onboarding.css";

const target = document.querySelector<HTMLElement>("#onboarding");
if (!target) throw new Error("Onboarding mount point not found.");

mount(Onboarding, { target });
