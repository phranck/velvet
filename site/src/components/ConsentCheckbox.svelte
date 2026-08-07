<script lang="ts">
  import type { Snippet } from "svelte";

  import { createSquirclePath } from "../lib/squircle.js";

  /**
   * A tick box for a question the user answers about themselves, with room for
   * the sentence that says what answering yes actually means.
   *
   * Written for the two places that ask permission rather than collect data:
   * whether security updates may install themselves, and whether an
   * installation may be named as a reference. Both need the explanation next to
   * the box rather than in a tooltip, because somebody deciding whether to
   * agree should not have to go looking for what they are agreeing to.
   *
   * The whole thing is a `label`, so the sentence is part of the hit area and
   * the box does not have to be aimed at.
   *
   * The box is a real checkbox with the platform's own artwork switched off,
   * and the shape beside it is drawn here as a squircle from the same path
   * builder the step markers use, so the two agree. The input keeps every
   * behaviour that matters, so the space bar, the label, form association, and
   * assistive technology all work as they would with any checkbox. Only the
   * picture changes.
   *
   * Colours come from `--consent-text`, `--consent-muted`, and
   * `--consent-checked`, which each tool sets from its own palette. The
   * component names no palette of its own, so it can sit in a tool that has no
   * idea the other one exists.
   */
  let {
    checked,
    onchange,
    children,
    note,
  }: {
    /** Whether the box is currently ticked. */
    checked: boolean;
    /** Called with the new state whenever the visitor changes it. */
    onchange: (checked: boolean) => void;
    /** The question itself, in as few words as it takes. */
    children: Snippet;
    /** What agreeing means, shown quieter beneath the question. */
    note?: Snippet;
  } = $props();

  /**
   * The outline, inset by half its own stroke so the drawn edge sits inside
   * the box rather than half outside it.
   */
  const OUTLINE = createSquirclePath(100, 5);
  /** The tick, drawn across the middle third of the shape. */
  const TICK = "M30 51 L44 66 L71 35";
</script>

<label class="consent">
  <input
    type="checkbox"
    {checked}
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
  <svg class="mark" viewBox="0 0 100 100" aria-hidden="true">
    <path
      d={OUTLINE}
      fill="none"
      stroke="currentColor"
      stroke-width="9"
      stroke-linejoin="round"
    ></path>
    {#if checked}
      <path
        d={TICK}
        fill="none"
        stroke="currentColor"
        stroke-width="11"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>
    {/if}
  </svg>
  <span>
    {@render children()}
    {#if note}
      <small>{@render note()}</small>
    {/if}
  </span>
</label>

<style>
  .consent {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    color: var(--consent-text, inherit);
    font-size: var(--consent-font-size, 1rem);
    line-height: 1.4;
    /* The whole label toggles the box, wording included, so the pointer says so
       across all of it rather than over the drawn shape alone. The input itself
       is transparent but not click-through, so it inherits this and the two
       agree wherever the pointer lands. */
    cursor: pointer;
  }
  .consent small {
    display: block;
    margin-top: 2px;
    color: var(--consent-muted, inherit);
    font-size: inherit;
  }
  /*
   * Kept in the page rather than hidden away, because a box removed from the
   * layout is also removed from where the focus ring would be drawn. Stacking
   * it under the shape at the same size leaves it clickable and focusable
   * whilst the drawing is what anyone sees.
   */
  .consent input {
    flex: none;
    inline-size: 1.15em;
    block-size: 1.15em;
    margin: 0.21em -1.15em 0 0;
    appearance: none;
    opacity: 0;
  }
  /*
   * Offset so the shape sits on the middle of the first line rather than on
   * the middle of its line box, which are not the same thing: a line box
   * carries room for descenders that the letters on that line mostly do not
   * use. Both the size and the offset are in em, so they hold at any size.
   */
  .mark {
    flex: none;
    inline-size: 1.15em;
    block-size: 1.15em;
    margin-top: 0.21em;
    color: var(--consent-muted, inherit);
    pointer-events: none;
  }
  /*
   * A link the caller put in its own text, reached with `:global` because that
   * text is written at the call site and carries no scope of this component.
   * Underlined rather than coloured alone, since the sentence sits on a
   * coloured row already and colour by itself would not separate it.
   */
  .consent span :global(a) {
    color: var(--consent-link, var(--consent-accent, currentColor));
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  /* Agreement is the state worth showing, so it is the one that gets a colour. */
  .consent input:checked ~ .mark {
    color: var(--consent-checked, var(--consent-accent, currentColor));
  }
  .consent input:focus-visible ~ .mark {
    border-radius: 30%;
    outline: 2px solid var(--consent-accent, currentColor);
    outline-offset: 3px;
  }
</style>
