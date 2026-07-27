<script lang="ts">
  import { useSliderContext } from "./context";

  const context = useSliderContext();
</script>

<div class="slider-heading">
  <label for={context.id}>{context.label}</label>
  <output for={context.id}>{context.model.output}</output>
</div>

<style>
  .slider-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  label {
    color: var(--tool-text);
    font-size: 14px;
    font-weight: 600;
  }
  output {
    min-width: 52px;
    padding: 3px 6px;
    border-radius: 5px;
    background: var(--tool-panel-raised);
    color: var(--tool-text);
    font-family: var(--tool-mono);
    font-size: 13px;
    text-align: center;
  }
</style>
