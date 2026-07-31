<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import {
    createDisclosureMotion,
    type DisclosureMotionController,
  } from "../lib/disclosure-motion";
  import type { ConfiguratorSectionId } from "./section-state";

  let {
    id,
    title,
    icon,
    open,
    onToggle,
    children,
  }: {
    id: ConfiguratorSectionId;
    title: string;
    icon: string;
    open: boolean;
    onToggle: (id: ConfiguratorSectionId, open: boolean) => void | Promise<void>;
    children: Snippet;
  } = $props();

  let renderedOpen = $state((() => open)());
  let details: HTMLDetailsElement;
  let content: HTMLElement;
  let motion: DisclosureMotionController | null = null;
  let mounted = $state(false);

  function reducedMotion(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  onMount(() => {
    motion = createDisclosureMotion(details, content);
    mounted = true;
    return () => motion?.destroy();
  });

  $effect(() => {
    const expanded = open;
    if (mounted) motion?.setExpanded(expanded, reducedMotion());
  });
</script>

<details
  bind:this={details}
  bind:open={renderedOpen}
  data-configurator-section={id}
  data-section-expanded={open}
>
  <summary
    onclick={(event) => {
      event.preventDefault();
      void onToggle(id, !open);
    }}
  >
    <span class="section-title">
      <i class="ph-duotone {icon}" aria-hidden="true"></i>
      {title}
    </span>
    <i class="ph-duotone ph-caret-circle-down caret" aria-hidden="true"></i>
  </summary>
  <div bind:this={content} class="section-content" data-section-content>
    <div class="section-content-inner">
      {@render children()}
    </div>
  </div>
</details>

<style>
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin: 0 -22px;
    padding: 17px 22px;
    border-radius: 0;
    background: var(--tool-panel-raised);
    color: var(--tool-text);
    cursor: pointer;
    list-style: none;
    font-size: 17px;
    font-weight: 650;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: 4px;
    border-radius: 4px;
  }
  .section-title {
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }
  .section-title i {
    color: var(--tool-accent);
    font-size: 18px;
  }
  .caret {
    width: 22px;
    height: 22px;
    display: inline-block;
    flex: none;
    color: var(--tool-faint);
    font-size: 22px;
    line-height: 1;
    transition: transform 160ms ease-in-out;
  }
  details[data-section-expanded="true"] .caret {
    transform: rotate(180deg);
  }
  .section-content-inner {
    padding: 0 0 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      transition: none;
    }
  }
</style>
