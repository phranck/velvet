<script lang="ts">
  let {
    name,
    value,
    screenshot,
    selected,
    radioName,
    onSelect,
  }: {
    name: string;
    value: string;
    screenshot: string;
    selected: boolean;
    radioName: string;
    onSelect: (value: string) => void;
  } = $props();
</script>

<label class:selected data-theme-card-option={value}>
  <input
    type="radio"
    name={radioName}
    value={value}
    checked={selected}
    onchange={() => onSelect(value)}
  />
  <span class="image-shell">
    <img src={screenshot} alt="" />
    <span class="check" aria-hidden="true">
      <i class="ph-duotone ph-check-circle"></i>
    </span>
  </span>
  <strong>{name}</strong>
</label>

<style>
  label {
    min-width: 0;
    display: grid;
    gap: 0.55rem;
    padding: 0.38rem;
    border: 0;
    border-radius: 0.75rem;
    background: var(--picker-surface, #ffffff);
    color: var(--picker-text, #171922);
    cursor: pointer;
    transition:
      background 160ms ease,
      transform 160ms ease;
  }
  label:hover {
    background: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 7%,
      var(--picker-surface, #ffffff)
    );
    transform: translateY(-1px);
  }
  label.selected {
    background: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 16%,
      var(--picker-surface, #ffffff)
    );
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
  .image-shell {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-radius: 0.52rem;
    background: #0a0b0f;
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }
  .check {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    width: 1.55rem;
    height: 1.55rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--picker-accent, #6366f1);
    color: #fff;
    font-size: 1.2rem;
    opacity: 0;
    transform: scale(0.8);
    transition:
      opacity 160ms ease,
      transform 160ms ease;
  }
  label.selected .check {
    opacity: 1;
    transform: scale(1);
  }
  strong {
    padding: 0 0.25rem 0.18rem;
    overflow: hidden;
    font-size: 0.85rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    label,
    .check {
      transition: none;
    }
    label:hover {
      transform: none;
    }
  }
</style>
