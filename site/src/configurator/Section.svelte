<script lang="ts">
  import { tick, type Snippet } from "svelte";

  interface Props {
    /** The heading, which is also what the toggle announces. */
    title: string;
    /** Whether the body is showing. */
    open: boolean;
    /** Where this section stands, so the move controls know what is possible. */
    position: number;
    /** How many sections there are in total. */
    count: number;
    /** Called when the heading is used to open or close the section. */
    onToggle: () => void;
    /** Called to move this section, negative towards the top. */
    onMove: (by: number) => void;
    /** Called when a section is dropped onto this one. */
    onDrop?: (carried: string) => void;
    /** What identifies this section when it is dragged. */
    key: string;
    /**
     * Whether this section takes part in the arrangement at all.
     *
     * The update notices do not. They stand at the top whenever there are any,
     * so they carry no grip, no move buttons, and refuse a drop.
     */
    movable?: boolean;
    /** What the section holds. */
    children: Snippet;
  }

  const {
    title,
    open,
    position,
    count,
    onToggle,
    onMove,
    onDrop,
    key,
    movable = true,
    children,
  }: Props = $props();

  /** Whether something is being carried over this section right now. */
  let over = $state(false);

  /** What travels with a drag: the section's key, and nothing else. */
  const DRAG_TYPE = "application/x-velvet-section";

  function startDrag(event: DragEvent): void {
    event.dataTransfer?.setData(DRAG_TYPE, key);
    // Text as well, so a drag that leaves the window does something sensible
    // rather than nothing.
    event.dataTransfer?.setData("text/plain", title);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  /** Moves this section with the arrow keys whilst the grip has focus. */
  function moveByKey(event: KeyboardEvent): void {
    if (event.key === "ArrowUp") onMove(-1);
    else if (event.key === "ArrowDown") onMove(1);
    else if (event.key === "Home") onMove(-position);
    else if (event.key === "End") onMove(count - 1 - position);
    else return;
    event.preventDefault();
    // Focus follows the section, so a run of presses keeps moving the same one
    // rather than moving whatever has landed under the pointer.
    const grip = event.currentTarget as HTMLElement;
    void tick().then(() => grip.focus());
  }

  function dragOver(event: DragEvent): void {
    if (!movable) return;
    if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
    // Preventing the default is what makes an element a drop target at all.
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    over = true;
  }

  function drop(event: DragEvent): void {
    over = false;
    if (!movable) return;
    const carried = event.dataTransfer?.getData(DRAG_TYPE);
    if (!carried) return;
    event.preventDefault();
    onDrop?.(carried);
  }

  /**
   * The element whose height is animated.
   *
   * One element grows and everything below it is carried by ordinary layout.
   * Nothing else is moved by hand, because every element moved by hand is
   * another animation to keep in step and another one somebody will forget.
   */
  let body = $state<HTMLElement | null>(null);

  /**
   * Whether the body is in the layout at all.
   *
   * Kept apart from `open` because an element already out of the layout cannot
   * be animated out of it: it leaves when its collapse has finished rather
   * than when the state changed.
   */
  let present = $state(true);

  /**
   * What `open` was last time this settled, or undefined before the first run.
   *
   * The first run only records the state, so a section that opens with the
   * page does not animate its way in.
   */
  let previous: boolean | undefined;

  /**
   * Animates the body to or from its own height.
   *
   * Handed to the browser's own timeline rather than driven from script. The
   * same arithmetic run per frame by a script is what makes a height animation
   * expensive; run by the browser it costs nothing measurable.
   */
  function animate(element: HTMLElement, showing: boolean): void {
    const height = element.scrollHeight;
    const reduced = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animation = element.animate(
      showing
        ? [{ height: "0px", opacity: 0 }, { height: `${height}px`, opacity: 1 }]
        : [{ height: `${height}px`, opacity: 1 }, { height: "0px", opacity: 0 }],
      { duration: reduced ? 0 : 200, easing: "ease", fill: "none" },
    );
    animation.finished
      .then(() => {
        if (!showing) present = false;
      })
      .catch(() => {
        // A cancelled animation is the state changing again mid-flight, which
        // the next run settles.
      });
  }

  $effect(() => {
    const showing = open;
    if (previous === undefined) {
      previous = showing;
      present = showing;
      return;
    }
    if (showing === previous) return;
    previous = showing;
    if (showing) {
      present = true;
      // The element does not exist until Svelte has flushed this change.
      void tick().then(() => {
        if (body) animate(body, true);
      });
    } else if (body) {
      animate(body, false);
    } else {
      present = false;
    }
  });
</script>

<!--
  A region rather than a bare container: it is named, so somebody moving
  through the sidebar by landmark hears which section they are in. Dragging is
  not an accessible way to reorder anything, which is why the two move buttons
  exist beside it rather than instead of it.
-->
<section
  class="section"
  class:section--open={open}
  class:section--over={over}
  aria-label={title}
  ondragover={dragOver}
  ondragleave={() => (over = false)}
  ondrop={drop}
>
  <div
    class="section__bar"
    class:section__bar--fixed={!movable}
    role="group"
    aria-label="{title} heading and controls"
    draggable={movable}
    ondragstart={startDrag}
  >
    {#if movable}
      <!--
        The grip is the whole of the reordering: dragged with a pointer, and
        moved with the arrow keys when it has focus. An order that can only be
        dragged is no order at all for part of the people using it, so this
        carries both rather than there being a second set of controls beside
        it.
      -->
      <button
        type="button"
        class="section__grip"
        aria-label="Reorder {title}, {position + 1} of {count}. Use the arrow keys."
        onkeydown={moveByKey}
      >
        <span aria-hidden="true">⠿</span>
      </button>
    {/if}
    <button
      type="button"
      class="section__toggle"
      aria-expanded={open}
      onclick={onToggle}
    >
      <span class="section__chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
      <span class="section__title">{title}</span>
    </button>

  </div>
  {#if present}
    <div class="section__body" bind:this={body}>
      <div class="section__content">
        {@render children()}
      </div>
    </div>
  {/if}
</section>

<style>
  /* Set off from its neighbours by a surface of its own rather than by a rule,
     so the sidebar reads as a stack of things rather than as one list. */
  .section {
    border: 1px solid var(--configurator-divider);
    /* A surface standing on the sidebar rather than one nested in anything, so
       it carries the stated radius and what it holds carries the derived one. */
    border-radius: var(--configurator-radius);
    background: var(--configurator-raised);
    overflow: hidden;
  }

  .section__bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding-right: 0.35rem;
    cursor: grab;
  }

  .section__bar:active {
    cursor: grabbing;
  }

  .section__bar--fixed {
    cursor: default;
  }

  /* The grip says the row can be carried, and is what the arrow keys act on. */
  .section__grip {
    display: flex;
    align-items: center;
    padding: 0.35rem 0.1rem 0.35rem var(--configurator-inset);
    margin-right: -0.25rem;
    border: none;
    border-radius: 0.35rem;
    background: none;
    color: var(--configurator-edge);
    font-size: var(--configurator-glyph);
    line-height: 1;
    cursor: grab;
  }

  .section__grip:hover {
    color: var(--configurator-text);
  }

  .section__grip:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: -2px;
  }

  /* What the section being dropped on looks like whilst something is over it. */
  .section--over {
    border-color: var(--configurator-accent);
    background: var(--configurator-accent-surface);
  }

  .section__toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    padding: 0.5rem var(--configurator-inset);
    border: none;
    background: none;
    color: var(--configurator-text);
    font-family: var(--configurator-font-label);
    font-size: var(--configurator-text-label);
    letter-spacing: var(--configurator-tracking-label);
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
  }

  .section__chevron {
    color: var(--configurator-accent);
    font-size: var(--configurator-glyph-small);
  }

  .section__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section__toggle:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: -2px;
  }

  /* The one element whose height moves. Everything below it is carried by
     layout, so nothing else needs an animation of its own. */
  .section__body {
    overflow: hidden;
  }

  /* The distance every nested radius is derived from, so a control in here
     holds the same gap from the surface's curve around the whole corner. The
     top is the bar's, which already stands the content off the heading. */
  .section__content {
    padding: 0 var(--configurator-inset) var(--configurator-inset);
  }

  /* Prose inside a rounded surface stands in by half the radius on top of that
     padding, because a line flush against a curve reads as colliding with it.
     A control does not: it runs the width of the surface and has an edge of
     its own. */
  .section__content :global(p) {
    padding-inline: var(--configurator-text-inset);
  }
</style>
