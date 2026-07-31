<script lang="ts">
  import type { CuratedServiceIcon } from "../../lib/icons.js";
  import ServiceIconOption from "./ServiceIconOption.svelte";

  let {
    id,
    legend,
    description,
    value,
    automaticIcon,
    options,
    onChange,
  }: {
    id: string;
    legend: string;
    description?: string;
    value: string | null;
    automaticIcon: string;
    options: readonly CuratedServiceIcon[];
    onChange: (value: string | null) => void;
  } = $props();

  let optionsElement = $state<HTMLElement>();
  const DESKTOP_COLUMN_COUNT = 11;
  const availableOptions = $derived([
    { label: "Automatic", icon: automaticIcon, value: null },
    ...options.map((option) => ({ ...option, value: option.icon })),
  ]);

  function optionElements(): HTMLButtonElement[] {
    return optionsElement
      ? [...optionsElement.querySelectorAll<HTMLButtonElement>("[role='option']")]
      : [];
  }

  function focusOption(index: number): void {
    const target = Math.max(0, Math.min(index, availableOptions.length - 1));
    optionElements()[target]?.focus();
  }

  function handleOptionKeydown(event: KeyboardEvent, currentIndex: number): void {
    const columnCount = optionsElement
      ? getComputedStyle(optionsElement).gridTemplateColumns
          .trim()
          .split(/\s+/).length
      : DESKTOP_COLUMN_COUNT;
    let targetIndex: number | null = null;

    if (event.key === "ArrowDown") {
      targetIndex = (currentIndex + columnCount) % availableOptions.length;
    } else if (event.key === "ArrowUp") {
      targetIndex =
        (currentIndex - columnCount + availableOptions.length) %
        availableOptions.length;
    } else if (event.key === "ArrowRight") {
      targetIndex = (currentIndex + 1) % availableOptions.length;
    } else if (event.key === "ArrowLeft") {
      targetIndex =
        (currentIndex - 1 + availableOptions.length) % availableOptions.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = availableOptions.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    focusOption(targetIndex);
  }
</script>

<fieldset data-service-icon-picker>
  <legend>{legend}</legend>
  {#if description}<p>{description}</p>{/if}
  <div class="picker">
    <div
      id={`${id}-listbox`}
      class="options"
      bind:this={optionsElement}
      role="listbox"
      aria-label={legend}
    >
      {#each availableOptions as option, optionIndex (option.value)}
        <ServiceIconOption
          label={option.label}
          icon={option.icon}
          selected={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onSelect={() => onChange(option.value)}
          onKeydown={(event) => handleOptionKeydown(event, optionIndex)}
        />
      {/each}
    </div>
  </div>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    padding: 0;
    margin-inline: var(--picker-text-inset, 0);
    color: var(--picker-text, currentColor);
    font-size: var(--picker-label-font-size, 0.9rem);
    font-weight: 700;
  }
  p {
    margin: 0.3rem var(--picker-text-inset, 0) 0.75rem;
    color: var(--picker-muted, #6f7280);
    font-size: var(--picker-description-font-size, 0.8rem);
    line-height: 1.4;
  }
  .picker {
    min-width: 0;
    margin-top: 0.55rem;
  }
  .options {
    position: static;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(11, minmax(0, 1fr));
    gap: 0.25rem;
    padding: 0.35rem;
    border-radius: var(--picker-popover-radius, 0.65rem);
    background: var(--picker-popover, var(--picker-surface, #ffffff));
    box-shadow: none;
    box-sizing: border-box;
  }

  @media (max-width: 520px) {
    .options {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
