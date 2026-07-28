<script lang="ts">
  import ColorSwatch from "./ColorSwatch.svelte";

  let {
    name,
    label,
    value,
    onChange,
  }: {
    name: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
  } = $props();

  let draft = $derived(value);
  const valid = $derived(/^#[\da-f]{6}$/i.test(draft));
  const errorId = $derived(`${name}-error`);

  function updateDraft(next: string): void {
    draft = next;
    if (/^#[\da-f]{6}$/i.test(next)) onChange(next.toLowerCase());
  }
</script>

<div class="color-control">
  <label for={`${name}-text`}>{label}</label>
  <div class="inputs">
    <ColorSwatch color={value} size={28}>
      <input
        id={`${name}-picker`}
        type="color"
        value={value}
        aria-label={`${label} color picker`}
        oninput={(event) => updateDraft(event.currentTarget.value)}
      />
    </ColorSwatch>
    <input
      id={`${name}-text`}
      data-color-value
      value={draft}
      maxlength="7"
      spellcheck="false"
      aria-invalid={!valid}
      aria-describedby={valid ? undefined : errorId}
      oninput={(event) => updateDraft(event.currentTarget.value)}
    />
  </div>
  {#if !valid}
    <span class="error" id={errorId}>Use #RRGGBB</span>
  {/if}
</div>

<style>
  .color-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 12px;
  }
  label {
    color: var(--tool-text);
    font-size: 14px;
    font-weight: 550;
  }
  .inputs {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  input[data-color-value] {
    width: 82px;
    padding: 6px 8px;
    border: 1px solid var(--tool-line);
    border-radius: 7px;
    outline: none;
    background: var(--tool-input);
    color: var(--tool-text);
    font-family: var(--tool-mono);
    font-size: 13px;
    text-transform: lowercase;
  }
  input[data-color-value]:focus-visible {
    border-color: var(--tool-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tool-accent) 22%, transparent);
  }
  input[aria-invalid="true"] {
    border-color: var(--tool-error);
  }
  .error {
    grid-column: 2;
    color: var(--tool-error);
    font-size: 12px;
  }
</style>
