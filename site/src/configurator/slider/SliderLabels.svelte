<script lang="ts">
  import { useSliderContext } from "./context";

  const context = useSliderContext();
</script>

<div class="slider-labels" aria-hidden="true">
  {#each context.model.options as option, index (option.value)}
    <span style:left={`${context.model.positions[index] * 100}%`}>
      {option.label}
    </span>
  {/each}
</div>

<style>
  .slider-labels {
    position: relative;
    height: 16px;
    margin: 0 9px;
    color: var(--tool-faint);
    font-size: 12px;
  }
  .slider-labels span {
    position: absolute;
    top: 0;
    white-space: nowrap;
    transform: translateX(-50%);
  }
  .slider-labels span:first-child {
    transform: translateX(0);
  }
  .slider-labels span:last-child {
    transform: translateX(-100%);
  }
</style>
