<script lang="ts">
  const RAINBOW_COLORS = [
    "#ff453a",
    "#ff9f0a",
    "#ffd60a",
    "#30d158",
    "#64d2ff",
    "#0a84ff",
    "#5e5ce6",
    "#bf5af2",
    "#ff375f",
  ] as const;
</script>

<div class="rainbow-scale" data-rainbow-scale aria-hidden="true">
  {#each RAINBOW_COLORS as color (color)}
    <span data-rainbow-color style:background={color}></span>
  {/each}
</div>

<style>
  .rainbow-scale {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    gap: 3px;
  }
</style>
