<script lang="ts">
  import { useSliderContext } from "./context";

  let { tickmarks = false }: { tickmarks?: boolean } = $props();
  const context = useSliderContext();
</script>

<div
  class="slider-control"
  style={`--slider-progress: ${context.model.ratio * 100}%; --slider-ratio: ${context.model.ratio}`}
>
  <div class="slider-track" aria-hidden="true"></div>
  {#if tickmarks}
    <div class="slider-ticks" aria-hidden="true">
      {#each context.model.positions as position, index (index)}
        <span
          data-slider-tick
          class:active={position <= context.model.ratio}
          style:left={`${position * 100}%`}
        ></span>
      {/each}
    </div>
  {/if}
  <span class="slider-knob" data-slider-knob aria-hidden="true"></span>
  <input
    id={context.id}
    type="range"
    min={context.model.inputMin}
    max={context.model.inputMax}
    step={context.model.inputStep}
    value={context.model.inputValue}
    aria-valuetext={context.model.ariaValueText}
    oninput={(event) =>
      context.change(context.model.valueFromInput(event.currentTarget.value))}
  />
</div>

<style>
  .slider-control {
    position: relative;
    height: 22px;
  }
  .slider-track {
    position: absolute;
    top: 9px;
    right: 9px;
    left: 9px;
    height: 4px;
    border-radius: 999px;
    background:
      linear-gradient(var(--slider-active), var(--slider-active)) 0 0 /
        var(--slider-progress) 100% no-repeat,
      var(--slider-inactive);
  }
  .slider-ticks {
    position: absolute;
    inset: 0 9px;
  }
  .slider-ticks span {
    position: absolute;
    top: 7px;
    width: 8px;
    height: 8px;
    border: 2px solid var(--tool-panel);
    border-radius: 50%;
    background: var(--slider-inactive);
    transform: translateX(-50%);
  }
  .slider-ticks span.active {
    background: var(--slider-active);
  }
  .slider-knob {
    position: absolute;
    z-index: 2;
    top: 2px;
    left: calc(9px + (100% - 18px) * var(--slider-ratio));
    width: 18px;
    height: 18px;
    border: 2px solid var(--slider-inner-ring);
    border-radius: 50%;
    background: var(--slider-thumb);
    box-shadow:
      0 0 0 1px var(--slider-outer-ring),
      0 1px 5px rgba(0, 0, 0, 0.38);
    pointer-events: none;
    transform: translateX(-50%);
  }
  input {
    position: absolute;
    z-index: 3;
    inset: 0;
    width: 100%;
    height: 22px;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .slider-control:has(input:focus-visible) {
    border-radius: 6px;
    outline: 2px solid var(--slider-active);
    outline-offset: 3px;
  }
</style>
