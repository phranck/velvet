<script lang="ts">
  import type { Snippet } from "svelte";

  import { OVERLAY_MOTION_MS } from "./motion.js";

  let {
    open,
    label,
    onclose,
    children,
  }: {
    open: boolean;
    label: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  let dialog = $state<HTMLDivElement | null>(null);
  let restoreFocusTo: HTMLElement | null = null;

  /**
   * Elements that can hold focus, in document order.
   *
   * Queried on demand rather than cached, because the footer's actions change
   * while an update runs and a cached list would trap focus on a button that
   * no longer exists.
   */
  function focusable(): HTMLElement[] {
    if (!dialog) return [];
    return [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
      return;
    }
    if (event.key !== "Tab") return;

    const targets = focusable();
    if (targets.length === 0) {
      event.preventDefault();
      return;
    }
    const first = targets[0]!;
    const last = targets[targets.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    if (!open) return;
    restoreFocusTo = document.activeElement as HTMLElement | null;
    // The page behind must not scroll while the overlay is open, so the
    // background stays exactly where the reader left it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => (focusable()[0] ?? dialog)?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusTo?.focus();
    };
  });
</script>

<svelte:window on:keydown={open ? onkeydown : undefined} />

{#if open}
  <div
    class="scrim"
    style={`--overlay-motion: ${OVERLAY_MOTION_MS}ms`}
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) onclose();
    }}
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabindex="-1"
      bind:this={dialog}
    >
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: clamp(1rem, 5vw, 3rem);
    background: var(--velvet-scrim);
    backdrop-filter: blur(6px);
    animation: overlay-fade var(--overlay-motion) ease-in-out;
  }

  .dialog:focus {
    outline: none;
  }

  .dialog {
    display: flex;
    flex-direction: column;
    width: min(46rem, 100%);
    /* The dialog itself never grows past the viewport, which is what keeps the
       header and footer fixed whilst only the body scrolls. */
    max-height: min(44rem, 100%);
    overflow: clip;
    border-radius: 12px;
    background: var(--tool-panel);
    box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 0.3);
    animation: overlay-rise var(--overlay-motion) ease-in-out;
  }

  @keyframes overlay-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes overlay-rise {
    from {
      opacity: 0;
      transform: translateY(0.75rem) scale(0.99);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scrim,
    .dialog {
      animation: none;
    }
  }
</style>
