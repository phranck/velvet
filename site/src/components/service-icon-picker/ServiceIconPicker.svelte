<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { CuratedServiceIcon } from "../../lib/icons.js";
  import {
    resolveListboxPlacement,
    type ListboxPlacement,
  } from "../../lib/listbox-placement.js";

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

  let open = $state(false);
  let activeIndex = $state(0);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let optionsElement = $state<HTMLElement>();
  let placement = $state<ListboxPlacement>("down");
  let maxOptionsHeight = $state(288);
  let suppressTriggerFocusRing = $state(false);
  const availableOptions = $derived([
    { label: "Automatic", icon: automaticIcon, value: null },
    ...options.map((option) => ({ ...option, value: option.icon })),
  ]);
  const selectedIndex = $derived(
    Math.max(0, availableOptions.findIndex((option) => option.value === value)),
  );
  const selected = $derived(availableOptions[selectedIndex]);

  function optionElements(): HTMLButtonElement[] {
    return root
      ? [...root.querySelectorAll<HTMLButtonElement>("[role='option']")]
      : [];
  }

  function updatePlacement(): void {
    if (!trigger || !optionsElement) return;
    const scrollBoundary = root?.closest<HTMLElement>(".control-scroll");
    const boundary = scrollBoundary?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight,
    };
    const resolved = resolveListboxPlacement(
      trigger.getBoundingClientRect(),
      boundary,
      optionsElement.scrollHeight,
    );
    placement = resolved.placement;
    maxOptionsHeight = resolved.maxHeight;
  }

  async function showOptions(focusActive: boolean): Promise<void> {
    open = true;
    await tick();
    updatePlacement();
    if (focusActive) optionElements()[activeIndex]?.focus();
  }

  async function openAt(index: number): Promise<void> {
    activeIndex = Math.max(0, Math.min(index, availableOptions.length - 1));
    await showOptions(true);
  }

  function closeAndRestoreFocus(suppressFocusRing = false): void {
    open = false;
    suppressTriggerFocusRing = suppressFocusRing;
    void tick().then(() => trigger?.focus());
  }

  function choose(option: (typeof availableOptions)[number]): void {
    onChange(option.value);
    closeAndRestoreFocus();
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    suppressTriggerFocusRing = false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void openAt(selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      void openAt(selectedIndex || availableOptions.length - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      void openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      void openAt(availableOptions.length - 1);
    }
  }

  function handleOptionsKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus(true);
      return;
    }

    const focusedIndex = optionElements().indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void openAt((Math.max(0, focusedIndex) + 1) % availableOptions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      void openAt(
        (focusedIndex <= 0 ? availableOptions.length : focusedIndex) - 1,
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      void openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      void openAt(availableOptions.length - 1);
    }
  }

  onMount(() => {
    const scrollBoundary = root?.closest<HTMLElement>(".control-scroll");
    const handleBoundaryChange = () => {
      if (open) updatePlacement();
    };
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (open && root && !root.contains(event.target as Node)) open = false;
    };
    const handleDocumentKeydown = (event: KeyboardEvent) => {
      if (!open || event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus(true);
    };

    window.addEventListener("resize", handleBoundaryChange);
    scrollBoundary?.addEventListener("scroll", handleBoundaryChange);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeydown);
    return () => {
      window.removeEventListener("resize", handleBoundaryChange);
      scrollBoundary?.removeEventListener("scroll", handleBoundaryChange);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeydown);
    };
  });
</script>

<fieldset data-service-icon-picker>
  <legend>{legend}</legend>
  {#if description}<p>{description}</p>{/if}
  <div
    class="picker"
    bind:this={root}
    onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
    }}
  >
    <button
      class="trigger"
      class:suppress-focus-ring={suppressTriggerFocusRing}
      bind:this={trigger}
      type="button"
      aria-label={`${legend}: ${selected.label}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${id}-listbox`}
      onclick={() => {
        suppressTriggerFocusRing = false;
        activeIndex = selectedIndex;
        if (open) open = false;
        else void showOptions(false);
      }}
      onblur={() => (suppressTriggerFocusRing = false)}
      onkeydown={handleTriggerKeydown}
    >
      <i class={`ph-duotone ${selected.icon} preview-icon`} aria-hidden="true"></i>
      <span>{selected.label}</span>
      <i class="ph-duotone ph-caret-down caret" aria-hidden="true"></i>
    </button>

    <div
      id={`${id}-listbox`}
      class="options"
      class:open
      class:open-up={placement === "up"}
      bind:this={optionsElement}
      style:max-height={`${maxOptionsHeight}px`}
      role="listbox"
      aria-label={legend}
      aria-hidden={!open}
      inert={!open}
      tabindex="-1"
      onkeydown={handleOptionsKeydown}
    >
      {#each availableOptions as option (option.value)}
        <button
          type="button"
          role="option"
          aria-selected={option.value === value}
          tabindex={open ? 0 : -1}
          onclick={() => choose(option)}
        >
          <i class={`ph-duotone ${option.icon}`} aria-hidden="true"></i>
          <span>{option.label}</span>
          <i
            class={`ph-duotone ${option.value === value ? "ph-check-fat" : "ph-blank"} check`}
            aria-hidden="true"
          ></i>
        </button>
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
    color: var(--picker-text, currentColor);
    font-size: 0.9rem;
    font-weight: 700;
  }
  p {
    margin: 0.3rem 0 0.75rem;
    color: var(--picker-muted, #6f7280);
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .picker {
    position: relative;
    min-width: 0;
    margin-top: 0.55rem;
  }
  button {
    border: 0;
    outline: none;
    color: var(--picker-text, #171922);
    font: inherit;
    cursor: pointer;
  }
  .trigger {
    width: 100%;
    height: 2.5rem;
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    padding: 0 0.75rem;
    border-radius: 0.55rem;
    background: var(--picker-surface, #ffffff);
    text-align: left;
  }
  .trigger:hover,
  .trigger[aria-expanded="true"] {
    background: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 10%,
      var(--picker-surface, #ffffff)
    );
  }
  .trigger:focus-visible:not(.suppress-focus-ring),
  .options button:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--picker-accent, #6366f1) 45%, transparent);
    outline-offset: 2px;
  }
  .trigger span,
  .options span {
    min-width: 0;
    overflow: hidden;
    font-size: 0.8rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-icon {
    color: var(--picker-accent, #6366f1);
    font-size: 1.25rem;
  }
  .caret {
    color: var(--picker-muted, #6f7280);
    font-size: 1rem;
    transition: transform 200ms ease-in-out;
  }
  .trigger[aria-expanded="true"] .caret {
    transform: rotate(180deg);
  }
  .options {
    position: absolute;
    z-index: 40;
    top: calc(100% + 0.35rem);
    right: 0;
    left: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0.35rem;
    border-radius: 0.65rem;
    background: var(--picker-popover, var(--picker-surface, #ffffff));
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-0.35rem) scale(0.985);
    transform-origin: top center;
    visibility: hidden;
    transition:
      opacity 200ms ease-in-out,
      transform 200ms ease-in-out,
      visibility 0s linear 200ms;
  }
  .options.open {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0) scale(1);
    visibility: visible;
    transition-delay: 0s;
  }
  .options.open-up {
    top: auto;
    bottom: calc(100% + 0.35rem);
    transform: translateY(0.35rem) scale(0.985);
    transform-origin: bottom center;
  }
  .options.open.open-up {
    transform: translateY(0) scale(1);
  }
  .options button {
    min-width: 0;
    height: 2.5rem;
    display: grid;
    grid-template-columns: 1.25rem minmax(0, 1fr) 1rem;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.55rem;
    border-radius: 0.45rem;
    background: transparent;
    text-align: left;
  }
  .options button:hover,
  .options button:focus-visible {
    background: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 16%,
      var(--picker-surface, #ffffff)
    );
  }
  .options button[aria-selected="true"] {
    background: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 12%,
      var(--picker-surface, #ffffff)
    );
  }
  .options button i {
    color: var(--picker-accent, #6366f1);
    font-size: 1.05rem;
  }
  .options .check {
    font-size: 0.85rem;
  }

  @media (max-width: 520px) {
    .options {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .caret,
    .options {
      transition: none;
    }
  }
</style>
