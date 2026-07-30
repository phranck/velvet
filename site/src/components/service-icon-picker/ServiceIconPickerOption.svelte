<script lang="ts">
  let {
    label,
    icon,
    value,
    selected,
    radioName,
    onSelect,
  }: {
    label: string;
    icon: string;
    value: string | null;
    selected: boolean;
    radioName: string;
    onSelect: (value: string | null) => void;
  } = $props();
</script>

<label class:selected title={label}>
  <input
    type="radio"
    name={radioName}
    value={value ?? ""}
    checked={selected}
    onchange={() => onSelect(value)}
  />
  <i class={`ph-duotone ${icon}`} aria-hidden="true"></i>
  <span>{label}</span>
</label>

<style>
  label {
    min-width: 0;
    min-height: 4.3rem;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.28rem;
    padding: 0.5rem 0.25rem;
    border: 0;
    border-radius: 0.65rem;
    background: var(--picker-surface, #ffffff);
    color: var(--picker-muted, #6f7280);
    cursor: pointer;
    transition:
      background 150ms ease,
      color 150ms ease;
  }
  label:hover {
    background: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 7%,
      var(--picker-surface, #ffffff)
    );
    color: var(--picker-text, #171922);
  }
  label.selected {
    background: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 16%,
      var(--picker-surface, #ffffff)
    );
    color: var(--picker-text, #171922);
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  label:has(input:focus-visible) {
    outline: 3px solid
      color-mix(in srgb, var(--picker-accent, #6366f1) 45%, transparent);
    outline-offset: 2px;
  }
  i {
    font-size: 1.45rem;
  }
  span {
    max-width: 100%;
    overflow: hidden;
    font-size: 0.68rem;
    font-weight: 650;
    line-height: 1.15;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    label {
      transition: none;
    }
  }
</style>
