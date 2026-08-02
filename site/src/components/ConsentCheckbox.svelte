<script lang="ts">
  import type { Snippet } from "svelte";

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
   * The box itself is a real checkbox with the platform's own artwork switched
   * off, and the ring beside it is drawn with the same icon family as the rest
   * of Velvet. The input keeps every behaviour that matters, so the space bar,
   * the label, form association, and assistive technology all work as they
   * would with any checkbox. Only the picture changes.
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
</script>

<label class="consent">
  <input
    type="checkbox"
    {checked}
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
  <i
    class="mark ph-duotone {checked ? 'ph-check-square' : 'ph-square'}"
    aria-hidden="true"
  ></i>
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
   * it under the icon at the same size leaves it clickable and focusable whilst
   * the icon is what anyone sees.
   */
  .consent input {
    flex: none;
    inline-size: 1.35em;
    block-size: 1.35em;
    margin: 0.05em -1.35em 0 0;
    appearance: none;
    opacity: 0;
  }
  /*
   * Sized and centred against the text rather than left at whatever the
   * platform draws, which reads as an afterthought beside the larger type the
   * onboarding uses. Half the difference between the line box and the icon
   * puts it on the middle of the first line at any size.
   */
  .mark {
    flex: none;
    margin-top: 0.05em;
    color: var(--consent-muted, inherit);
    font-size: 1.35em;
    line-height: 1;
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
    border-radius: 50%;
    outline: 2px solid var(--consent-accent, currentColor);
    outline-offset: 2px;
  }
</style>
