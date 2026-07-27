<script lang="ts">
  import type { VelvetTheme } from "../lib/config";
  import { syncModalDialog } from "./dialog-lifecycle.js";

  let {
    open,
    theme,
    candidate,
    error,
    onCandidateChange,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    theme: VelvetTheme;
    candidate: string;
    error: string;
    onCandidateChange: (value: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  let nameInput = $state<HTMLInputElement>();

  $effect(() => {
    if (!dialog || typeof dialog.showModal !== "function") return;
    const opened = syncModalDialog(dialog, open);
    if (opened) queueMicrotask(() => nameInput?.focus());
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="theme-name-dialog-title"
  style={`--modal-canvas: ${theme.palette.canvas}; --modal-surface: ${theme.card.background}; --modal-border: ${theme.card.border}; --modal-text: ${theme.text.primary}; --modal-muted: ${theme.text.secondary}; --modal-accent: ${theme.accent};`}
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
>
  <form
    method="dialog"
    onsubmit={(event) => {
      event.preventDefault();
      onConfirm();
    }}
  >
    <div class="dialog-icon" aria-hidden="true">
      <i class="ph-duotone ph-sparkle"></i>
    </div>
    <div>
      <h2 id="theme-name-dialog-title">Save as a new theme</h2>
      <p>Registry themes remain unchanged. Give your edited copy its own name.</p>
    </div>
    <label for="saved-theme-name">Theme name</label>
    <input
      id="saved-theme-name"
      bind:this={nameInput}
      name="saved-theme-name"
      maxlength="80"
      value={candidate}
      autocomplete="off"
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? "theme-name-dialog-error" : undefined}
      oninput={(event) => onCandidateChange(event.currentTarget.value)}
    />
    {#if error}
      <p id="theme-name-dialog-error" class="error">{error}</p>
    {/if}
    <div class="actions">
      <button type="button" class="secondary" onclick={onCancel}>Cancel</button>
      <button type="submit" class="primary">
        <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
        Save Config
      </button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 36px));
    padding: 0;
    border: 0;
    border-radius: 16px;
    background: color-mix(in srgb, var(--modal-surface) 90%, var(--modal-text));
    box-shadow: 0 28px 90px color-mix(in srgb, var(--modal-canvas) 78%, transparent);
    color: var(--modal-text);
    font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
  }
  dialog::backdrop {
    background: color-mix(in srgb, var(--modal-canvas) 78%, transparent);
    backdrop-filter: blur(8px);
  }
  form {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 18px 14px;
    padding: 26px;
  }
  .dialog-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: color-mix(in srgb, var(--modal-accent) 18%, transparent);
    color: var(--modal-accent);
    font-size: 22px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
  }
  p {
    margin: 6px 0 0;
    color: var(--modal-muted);
    font-size: 14px;
    line-height: 1.45;
  }
  label,
  input,
  .error,
  .actions {
    grid-column: 1 / -1;
  }
  label {
    margin-bottom: -10px;
    font-size: 14px;
    font-weight: 650;
  }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--modal-border);
    border-radius: 9px;
    outline: none;
    background: var(--modal-canvas);
    color: var(--modal-text);
    font: inherit;
    font-size: 15px;
  }
  input:focus-visible {
    border-color: var(--modal-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--modal-accent) 24%, transparent);
  }
  .error {
    margin: -9px 0 0;
    color: var(--modal-accent);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
  }
  button {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    border: 1px solid var(--modal-border);
    border-radius: 9px;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 650;
  }
  button.secondary {
    background: transparent;
    color: var(--modal-muted);
  }
  button.primary {
    border-color: var(--modal-accent);
    background: var(--modal-accent);
    color: var(--modal-canvas);
  }
  button:focus-visible {
    outline: 2px solid var(--modal-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: no-preference) {
    dialog[open] {
      animation: appear 0.18s ease-out;
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
