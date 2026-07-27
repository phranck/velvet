<script lang="ts">
  import { onMount, tick } from "svelte";
  import ColorSwatch from "./ColorSwatch.svelte";
  import {
    resolveListboxPlacement,
    type ListboxPlacement,
  } from "./listbox-placement";

  interface ListboxOption {
    value: string;
    label: string;
    description?: string;
    swatches?: string[];
  }

  let {
    id,
    name,
    ariaLabel,
    value,
    options,
    displayLabel,
    displayDescription,
    displaySwatches,
    compact = false,
    onChange,
  }: {
    id: string;
    name?: string;
    ariaLabel: string;
    value: string;
    options: ListboxOption[];
    displayLabel?: string;
    displayDescription?: string;
    displaySwatches?: string[];
    compact?: boolean;
    onChange: (value: string) => void;
  } = $props();

  let open = $state(false);
  let activeIndex = $state(0);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let optionsElement = $state<HTMLElement>();
  let placement = $state<ListboxPlacement>("down");
  let maxOptionsHeight = $state(0);
  let suppressTriggerFocusRing = $state(false);
  const selected = $derived(
    options.find((option) => option.value === value),
  );
  const selectedIndex = $derived(
    Math.max(0, options.findIndex((option) => option.value === value)),
  );
  const visibleLabel = $derived(displayLabel ?? selected?.label ?? "Select");
  const visibleDescription = $derived(
    displayDescription ?? selected?.description,
  );
  const visibleSwatches = $derived(
    displaySwatches ?? selected?.swatches ?? [],
  );

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
    if (options.length === 0) return;
    activeIndex = Math.max(0, Math.min(index, options.length - 1));
    await showOptions(true);
  }

  function closeAndRestoreFocus(suppressFocusRing = false): void {
    open = false;
    suppressTriggerFocusRing = suppressFocusRing;
    void tick().then(() => {
      if (!open) trigger?.focus();
    });
  }

  function choose(option: ListboxOption): void {
    onChange(option.value);
    closeAndRestoreFocus();
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (open && root && !root.contains(event.target as Node)) open = false;
  }

  function handleDocumentKeydown(event: KeyboardEvent): void {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    closeAndRestoreFocus(true);
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    suppressTriggerFocusRing = false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void openAt(selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      void openAt(selectedIndex || options.length - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      void openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      void openAt(options.length - 1);
    }
  }

  function handleOptionsKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus(true);
      return;
    }

    const focusedIndex = optionElements().indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void openAt((Math.max(0, focusedIndex) + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      void openAt((focusedIndex <= 0 ? options.length : focusedIndex) - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      void openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      void openAt(options.length - 1);
    }
  }

  onMount(() => {
    const scrollBoundary = root?.closest<HTMLElement>(".control-scroll");
    const handleBoundaryChange = () => {
      if (open) updatePlacement();
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

<div
  class="custom-listbox"
  bind:this={root}
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
  }}
>
  {#if name}<input type="hidden" {name} {value} />{/if}
  <button
    id={`${id}-trigger`}
    class="listbox-trigger"
    class:compact
    class:suppress-focus-ring={suppressTriggerFocusRing}
    bind:this={trigger}
    type="button"
    aria-label={ariaLabel}
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
    <span class="listbox-copy">
      <strong>{visibleLabel}</strong>
      {#if visibleDescription}<small>{visibleDescription}</small>{/if}
    </span>
    {#if visibleSwatches.length > 0}
      <span class="listbox-swatches" aria-hidden="true">
        {#each visibleSwatches as color}
          <ColorSwatch {color} size={compact ? 22 : 14} />
        {/each}
      </span>
    {/if}
    <i class="ph-duotone ph-caret-down" aria-hidden="true"></i>
  </button>

  {#if open}
    <div
      id={`${id}-listbox`}
      class="listbox-options"
      class:open-up={placement === "up"}
      bind:this={optionsElement}
      style:max-height={`${maxOptionsHeight}px`}
      role="listbox"
      tabindex="-1"
      aria-label={ariaLabel}
      onkeydown={handleOptionsKeydown}
    >
      {#each options as option (option.value)}
        <button
          id={`${id}-option-${option.value}`}
          type="button"
          role="option"
          aria-selected={option.value === value}
          onclick={() => choose(option)}
        >
          <i
            class="ph-duotone {option.value === value ? 'ph-check-fat' : 'ph-blank'}"
            aria-hidden="true"
          ></i>
          <span class="listbox-copy">
            <strong>{option.label}</strong>
            {#if option.description}<small>{option.description}</small>{/if}
          </span>
          {#if option.swatches?.length}
            <span class="listbox-swatches" aria-hidden="true">
              {#each option.swatches as color}
                <ColorSwatch {color} size={compact ? 22 : 14} />
              {/each}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .custom-listbox {
    position: relative;
    min-width: 0;
  }
  button {
    width: 100%;
    border: 1px solid var(--tool-line);
    background: var(--tool-input);
    color: var(--tool-text);
    font: inherit;
    cursor: pointer;
  }
  .listbox-trigger {
    min-height: 48px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border-radius: 9px;
    text-align: left;
  }
  .listbox-trigger.compact {
    min-height: 40px;
    padding: 7px 9px;
    border-radius: 8px;
  }
  .listbox-trigger:focus-visible:not(.suppress-focus-ring),
  .listbox-options button:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }
  .listbox-copy {
    min-width: 0;
  }
  .listbox-copy strong,
  .listbox-copy small {
    display: block;
  }
  .listbox-copy strong {
    overflow: hidden;
    font-size: 14px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .listbox-copy small {
    margin-top: 2px;
    color: var(--tool-muted);
    font-size: 12px;
  }
  .listbox-swatches {
    display: inline-flex;
    flex: none;
    gap: 3px;
  }
  .listbox-options {
    position: absolute;
    z-index: 30;
    top: calc(100% + 6px);
    right: 0;
    left: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 5px;
    border: 1px solid var(--tool-line);
    border-radius: 10px;
    background: var(--tool-panel-raised);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.38);
  }
  .listbox-options.open-up {
    top: auto;
    bottom: calc(100% + 6px);
  }
  .listbox-options button {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 9px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    text-align: left;
  }
  .listbox-options button:hover,
  .listbox-options button:focus-visible {
    background: color-mix(in srgb, var(--tool-accent) 20%, var(--tool-input));
  }
  .listbox-options button[aria-selected="true"] {
    background: color-mix(in srgb, var(--tool-accent) 12%, var(--tool-input));
  }
  .listbox-options i {
    color: var(--tool-accent);
    font-size: 16px;
  }
</style>
