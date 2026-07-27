import { getContext } from "svelte";

import type { SliderModel } from "./model";

export interface SliderColors {
  active?: string;
  inactive?: string;
  thumb?: string;
  innerRing?: string;
  outerRing?: string;
}

export interface SliderContext {
  readonly id: string;
  readonly label: string;
  readonly model: SliderModel;
  change: (value: number) => void;
}

export const SLIDER_CONTEXT = Symbol("velvet-slider");

export function useSliderContext(): SliderContext {
  const context = getContext<SliderContext>(SLIDER_CONTEXT);
  if (!context) throw new Error("Slider compound components require Slider.Root.");
  return context;
}
