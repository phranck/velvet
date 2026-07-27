<script lang="ts">
  import { setContext, type Snippet } from "svelte";

  import {
    SLIDER_CONTEXT,
    type SliderColors,
    type SliderContext,
  } from "./context";
  import {
    createSliderModel,
    type SliderOption,
  } from "./model";

  let {
    id,
    label,
    value,
    min = 0,
    max = 100,
    step = 1,
    output,
    options,
    colors = {},
    onChange,
    children,
  }: {
    id: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    output?: string;
    options?: SliderOption[];
    colors?: SliderColors;
    onChange: (value: number) => void;
    children: Snippet;
  } = $props();

  const model = $derived(
    createSliderModel({ value, min, max, step, output, options }),
  );
  const context: SliderContext = {
    get id() {
      return id;
    },
    get label() {
      return label;
    },
    get model() {
      return model;
    },
    change(nextValue) {
      onChange(nextValue);
    },
  };
  setContext(SLIDER_CONTEXT, context);

  const colorStyle = $derived(
    [
      `--slider-active: ${colors.active ?? "var(--tool-accent)"}`,
      `--slider-inactive: ${colors.inactive ?? "var(--tool-line)"}`,
      `--slider-thumb: ${colors.thumb ?? colors.active ?? "var(--tool-accent)"}`,
      `--slider-inner-ring: ${colors.innerRing ?? "#fff"}`,
      `--slider-outer-ring: ${colors.outerRing ?? "#000"}`,
    ].join("; "),
  );
</script>

<div class="slider-root" style={colorStyle}>
  {@render children()}
</div>

<style>
  .slider-root {
    display: grid;
    gap: 8px;
    margin-top: 16px;
  }
</style>
