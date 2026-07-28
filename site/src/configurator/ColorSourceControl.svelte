<script lang="ts">
  import {
    PALETTE_KEYS,
    resolveColorSource,
  } from "../lib/theme.js";
  import type { ConfiguratorTheme } from "./configuration";
  import ColorSwatch from "./ColorSwatch.svelte";
  import CustomListbox from "./CustomListbox.svelte";

  let {
    name,
    label,
    source,
    automaticColor,
    palette,
    onChange,
  }: {
    name: string;
    label: string;
    source: string;
    automaticColor: string;
    palette: ConfiguratorTheme["palette"];
    onChange: (value: string) => void;
  } = $props();

  const paletteLabels: Record<(typeof PALETTE_KEYS)[number], string> = {
    canvas: "Canvas",
    foreground: "Foreground",
    accent: "Accent",
    alternate: "Alternate",
    warning: "Warning",
    danger: "Danger",
    textPrimary: "Text Primary",
    textSecondary: "Text Secondary",
    textTertiary: "Text Tertiary",
  };
  const resolved = $derived(resolveColorSource(source, palette, automaticColor));
  const selected = $derived(/^#[\da-f]{6}$/i.test(source) ? "custom" : source);
  const options = $derived([
    { value: "auto", label: "Theme Default", swatches: [automaticColor] },
    ...PALETTE_KEYS.map((key) => ({
      value: key,
      label: paletteLabels[key],
      swatches: [palette[key]],
    })),
    { value: "custom", label: "Custom Color", swatches: [resolved] },
  ]);
  let draft = $derived(resolved);
  const valid = $derived(/^#[\da-f]{6}$/i.test(draft));

  function selectSource(value: string): void {
    onChange(value === "custom" ? resolved : value);
  }

  function updateCustom(value: string): void {
    draft = value;
    if (/^#[\da-f]{6}$/i.test(value)) onChange(value.toLowerCase());
  }
</script>

<div class="source-control">
  <label for={`${name}-source-trigger`}>{label}</label>
  <CustomListbox
    id={`${name}-source`}
    name={`${name}-source`}
    ariaLabel={`${label} color source`}
    value={selected}
    {options}
    compact
    onChange={selectSource}
  />
  <div class="color-value">
    <ColorSwatch color={resolved} size={32}>
      <input
        id={`${name}-picker`}
        name={`${name}-picker`}
        type="color"
        value={resolved}
        aria-label={`${label} color picker`}
        oninput={(event) => updateCustom(event.currentTarget.value)}
      />
    </ColorSwatch>
    <input
      id={`${name}-text`}
      name={`${name}-text`}
      data-color-value
      value={draft}
      maxlength="7"
      spellcheck="false"
      aria-label={`${label} hexadecimal color`}
      aria-invalid={!valid}
      oninput={(event) => updateCustom(event.currentTarget.value)}
    />
  </div>
</div>

<style>
  .source-control {
    display: grid;
    gap: 8px;
  }
  label {
    color: var(--tool-text);
    font-size: 14px;
    font-weight: 550;
  }
  input[data-color-value] {
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid var(--tool-line);
    border-radius: 7px;
    outline: none;
    background: var(--tool-input);
    color: var(--tool-text);
    font: inherit;
    font-size: 13px;
  }
  input[data-color-value]:focus-visible {
    border-color: var(--tool-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tool-accent) 22%, transparent);
  }
  .color-value {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  input[data-color-value] {
    min-width: 0;
    flex: 1;
    font-family: var(--tool-mono);
    text-transform: lowercase;
  }
  input[aria-invalid="true"] {
    border-color: var(--tool-error);
  }
</style>
