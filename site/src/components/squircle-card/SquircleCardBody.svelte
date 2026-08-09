<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The content of a {@link SquircleCardRoot}, held inside its edge.
   *
   * The inset is derived rather than chosen. A squircle pulls in towards its
   * corners, so the usable area is the largest rectangle that fits inside the
   * curve. For the superellipse Velvet draws, a point on the edge is
   * `(rx·√cos t, ry·√sin t)`, and the inscribed rectangle is widest where
   * `cos t · sin t` is greatest, which is at 45 degrees. There the point sits at
   * `√(√2 / 2)` of the half-axis, or 0.8409 of it, so the rectangle spans 84.09
   * per cent of the box and the margin is the remaining 15.91 per cent split
   * between the two sides.
   *
   * Stated as a percentage rather than in pixels, because a normalised card
   * stretches its shape to whatever box it is given and the pull towards the
   * corners grows with it. A fixed inset holds on one card size and lets the
   * content out of the curve on every other.
   *
   * Percentage padding resolves against the inline size on all four sides, so
   * the block inset is at least what the shape needs and usually more. That is
   * the safe direction: content inside the curve with room to spare, rather
   * than content the curve cuts.
   *
   * @param children - What the card holds.
   */
  let { children }: { children: Snippet } = $props();
</script>

<div class="body">
  {@render children()}
</div>

<style>
  .body {
    position: relative;
    display: flex;
    flex-direction: column;
    /* Where the content sits when the card is taller than it needs to be. A
       card sized to its content notices no difference; one given a minimum
       height centres rather than hanging from the top. */
    justify-content: var(--squircle-card-align, flex-start);
    padding: var(--squircle-card-safe-inset, 7.95%);
  }
</style>
