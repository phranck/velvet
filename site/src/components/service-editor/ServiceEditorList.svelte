<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    onAdd,
    addLabel = "Add another service",
  }: {
    children: Snippet;
    onAdd: () => void;
    addLabel?: string;
  } = $props();
</script>

<div class="service-list" data-service-editor-list>
  {@render children()}
</div>
<button class="add-service" type="button" onclick={onAdd}>
  <i class="ph-duotone ph-plus-circle" aria-hidden="true"></i>
  {addLabel}
</button>

<style>
  .service-list {
    display: grid;
    gap: 1rem;
  }
  .add-service {
    min-height: var(--service-editor-control-height, 2.5rem);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0 0.8rem;
    border: 0;
    border-radius: var(--service-editor-control-radius, 0.55rem);
    outline: none;
    background: var(--service-editor-raised, #272a36);
    color: var(--service-editor-text, #efedf5);
    cursor: pointer;
    font: inherit;
    font-weight: 650;
  }
  .add-service:focus-visible {
    outline: 2px solid var(--service-editor-accent, #8ca5ff);
    outline-offset: 3px;
  }
</style>
