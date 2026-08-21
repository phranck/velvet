<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import type { IconName } from "../lib/iconsax.generated.js";
  import { tick, type Snippet } from "svelte";

  interface Props {
    /** The heading, which is also what the toggle announces. */
    title: string;
    /**
     * The mark that stands before the heading.
     *
     * Chosen by the caller rather than derived from the key, because what a
     * section is about is a thing to decide once and read, not to work out
     * from an identifier.
     */
    icon: IconName;
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
    /**
     * Called when the grip is pressed, with the press and this section's box.
     *
     * The list takes it from there: it decides whether the press becomes a
     * drag, holds a place open, and puts the section down. This reports rather
     * than decides, because where a section may land is a question about the
     * list and not about any one section in it.
     */
    onGrab?: (event: PointerEvent, element: HTMLElement) => void;
    /**
     * Whether this is the section currently being carried.
     *
     * What is carried is shown faintly where it came from, so the list still
     * reads as holding it whilst the placeholder shows where it is going.
     */
    carrying?: boolean;
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
    icon,
    open,
    position,
    count,
    onToggle,
    onMove,
    onGrab,
    carrying = false,
    key,
    movable = true,
    children,
  }: Props = $props();

  /**
   * The section itself, which is the picture a drag is drawn from.
   *
   * The list needs its box and its markup to hold a place open and to show
   * what is being carried, and only this component has it.
   */
  let root = $state<HTMLElement | null>(null);

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
  bind:this={root}
  class="section"
  class:section--open={open}
  class:section--carrying={carrying}
  data-section-key={key}
  data-movable={movable ? "true" : "false"}
  data-carrying={carrying ? "true" : undefined}
  aria-label={title}
>
  {#if movable}
    <!--
      The grip is the whole of the reordering: dragged with a pointer, and
      moved with the arrow keys when it has focus. An order that can only be
      dragged is no order at all for part of the people using it, so this
      carries both rather than there being a second set of controls beside it.

      A column of its own down the whole section rather than a mark in the
      heading, so what is taken hold of is the section rather than its top
      edge, and so the hold stays in reach whilst the section is open.
    -->
    <button
      type="button"
      class="section__grip"
      aria-label="Reorder {title}, {position + 1} of {count}. Use the arrow keys."
      onpointerdown={(event) => {
        if (root) onGrab?.(event, root);
      }}
      onkeydown={moveByKey}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  {/if}

  <div class="section__main">
    <div
      class="section__bar"
      role="group"
      aria-label="{title} heading and controls"
    >
    <button
      type="button"
      class="section__toggle"
      aria-expanded={open}
      onclick={onToggle}
    >
      <span class="section__heading">
        <Icon name={icon} class="section__icon" />
        <span class="section__title">{title}</span>
      </span>
      <!--
        One icon for both states, turned half a circle when the section is
        closed. It stands at the far edge of the row, where it points at the
        content whilst that content is there, so the heading says which way the
        section stands without a second mark to tell apart. What it means is on
        the button's own `aria-expanded`, so this is decoration to a screen
        reader.
      -->
      <Icon
        name="arrow-circle-down"
        class="section__chevron{open ? '' : ' section__chevron--closed'}"
      />
    </button>
    </div>
    {#if present}
      <div class="section__body" bind:this={body}>
        <div class="section__content">
          {@render children()}
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  /* Set off from its neighbours by a surface of its own rather than by a rule,
     so the sidebar reads as a stack of things rather than as one list. */
  .section {
    /* A row: the grip stands in a column of its own down the whole section,
       and everything else stacks beside it. */
    display: flex;
    align-items: stretch;
    /* Its own height, never a share of the list's. The list is a column that
       scrolls, and a flex item in one shrinks to make the column fit, which
       would crop a section against its own overflow rather than scroll to it. */
    flex: 0 0 auto;
    /* A radius of its own, and with it the two values derived from a radius.
       All three sit here together because a derivation resolves on the element
       that declares it: left at the root, what this section holds would stay
       concentric with the root's corner rather than with this one. */
    --configurator-radius: var(--configurator-radius-section);
    --configurator-radius-inner: max(
      calc(var(--configurator-radius) - var(--configurator-inset)),
      0px
    );
    --configurator-text-inset: calc(var(--configurator-radius) / 2);
    border: 1px solid var(--configurator-divider);
    border-radius: var(--configurator-radius);
    background: var(--configurator-raised);
    overflow: hidden;
  }

  /* Out of the layout whilst it is being carried. The picture under the
     pointer is the section now, and the placeholder is where it will land, so
     leaving it here as well would show the same section three times. */
  .section--carrying {
    display: none;
  }

  /* Everything the grip stands beside: the heading, and what it opens. */
  .section__main {
    flex: 1;
    min-width: 0;
  }

  /* The heading row. The chevron is held at the top rather than centred on the
     title, so it sits in the corner at the same distance from both edges. */
  .section__bar {
    display: flex;
    align-items: flex-start;
    /* The same distance the section stands everything off its edges by, so a
       section has one spacing rather than one for its edges and another
       between the things inside it. */
    gap: var(--configurator-inset);
  }

  /* The grip says the section can be carried, and is what the arrow keys act
     on. Its own column down the full height, set off by a rule rather than by
     a surface, so it reads as part of the section rather than as a control
     sitting on it. */
  .section__grip {
    display: flex;
    /* The mark at the head of the column rather than in the middle of it. The
       column runs the whole section, and a section can be taller than the
       window, which would put its grip past the bottom edge with the heading
       still in view. */
    align-items: flex-start;
    padding-top: var(--configurator-inset);
    justify-content: center;
    flex: 0 0 auto;
    align-self: stretch;
    /* The section's own padding either side of the mark, so the grip stands
       off the edge by the same distance as everything else in here. The rule
       on the right is part of the column's width, so it comes off that side's
       padding, or the mark would sit a pixel left of the middle. */
    padding-left: var(--configurator-inset);
    padding-right: calc(var(--configurator-inset) - var(--configurator-hairline));
    border: none;
    border-right: 1px solid var(--configurator-divider);
    background: none;
    color: var(--configurator-edge);
    font-size: var(--configurator-glyph-grip);
    line-height: 1;
    cursor: grab;
  }

  .section__grip:active {
    cursor: grabbing;
  }

  .section__grip:hover {
    color: var(--configurator-text);
  }

  .section__grip:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: -2px;
  }

  .section__toggle {
    display: flex;
    align-items: flex-start;
    gap: var(--configurator-inset);
    flex: 1;
    min-width: 0;
    /* The same on all four sides, which is what the content below it takes as
       well, so nothing in a section stands closer to one edge than another. */
    padding: var(--configurator-inset);
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

  /* The turn takes as long as the body it announces, so the two read as one
     movement rather than as a mark that has already finished whilst the
     section is still opening. */
  :global(.section__chevron) {
    color: var(--configurator-accent);
    font-size: var(--configurator-glyph-chevron);
    line-height: 1;
    transition: transform 200ms ease;
  }

  :global(.section__chevron--closed) {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.section__chevron) {
      transition: none;
    }
  }

  /* The same size as the chevron opposite it, so the row is read as one mark
     at either end of a heading rather than as two of different weights. Quiet,
     because the accent is what says whether a section is open. */
  :global(.section__icon) {
    flex: 0 0 auto;
    font-size: var(--configurator-glyph-chevron);
    color: var(--configurator-text-muted);
  }

  /* The mark and the words as one thing, centred on each other rather than
     each aligned to the row, which is what left the two on different lines.
     It takes the rest of the row, which is what stands the chevron at its far
     edge rather than beside the last word. */
  .section__heading {
    display: flex;
    align-items: center;
    gap: var(--configurator-inset);
    flex: 1;
    min-width: 0;
  }

  .section__title {
    min-width: 0;
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
