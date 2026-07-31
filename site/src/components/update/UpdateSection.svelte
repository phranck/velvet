<script lang="ts">
  import {
    OverlayBody,
    OverlayFooter,
    OverlayHeader,
    OverlayRoot,
  } from "../overlay/index.js";
  import ReleaseNotes from "../release-notes/ReleaseNotes.svelte";
  import { describeUpdate, isUpdateRunning } from "../../lib/update-state.js";
  import type { AvailableRelease } from "../../lib/update-client.js";
  import type {
    ManagedUpdateReason,
    ManagedUpdateState,
  } from "@velvet/contracts";

  let {
    installedVersion,
    release,
    automaticSecurityUpdates,
    updateState,
    updateReason,
    onInstall,
    onAutomaticChange,
  }: {
    installedVersion: string;
    release: AvailableRelease | null;
    automaticSecurityUpdates: boolean;
    updateState?: ManagedUpdateState;
    updateReason?: ManagedUpdateReason;
    onInstall: () => void;
    onAutomaticChange: (enabled: boolean) => void;
  } = $props();

  let notesOpen = $state(false);

  const outcome = $derived(
    updateState ? describeUpdate(updateState, updateReason) : null,
  );
  const busy = $derived(outcome !== null && isUpdateRunning(outcome));
  // An update is only offered when the service reports a different version, so
  // an installation already on the newest release shows no call to action.
  const updateAvailable = $derived(
    release !== null && release.availableVersion !== installedVersion,
  );
</script>

<section aria-labelledby="velvet-update-heading">
  <header>
    <h2 id="velvet-update-heading">Velvet version</h2>
    <p class="versions">
      <span>Installed {installedVersion}</span>
      {#if updateAvailable && release}
        <span class="available">{release.availableVersion} available</span>
      {/if}
    </p>
  </header>

  {#if outcome}
    <p class="outcome" data-tone={outcome.tone} role="status">
      <strong>{outcome.title}</strong>
      {outcome.detail}
    </p>
  {/if}

  {#if updateAvailable && release}
    <div class="actions">
      <button type="button" class="secondary" onclick={() => (notesOpen = true)}>
        Release notes
      </button>
      <button type="button" onclick={onInstall} disabled={busy}>
        Install update
      </button>
    </div>
  {:else if !outcome}
    <p class="outcome" data-tone="success" role="status">
      <strong>Up to date</strong>
      Your status page is running the newest Velvet version.
    </p>
  {/if}

  <label class="automatic">
    <input
      type="checkbox"
      checked={automaticSecurityUpdates}
      onchange={(event) => onAutomaticChange(event.currentTarget.checked)}
    />
    <span>
      Install safe security updates automatically
      <small>
        Only security releases that need no configuration or data migration.
        Everything else always waits for you.
      </small>
    </span>
  </label>
</section>

{#if release}
  <OverlayRoot
    open={notesOpen}
    label="Release notes"
    onclose={() => (notesOpen = false)}
  >
    <OverlayHeader
      title={`Velvet ${release.availableVersion}`}
      onclose={() => (notesOpen = false)}
    >
      What is new in this release
    </OverlayHeader>
    <OverlayBody>
      <ReleaseNotes source={release.releaseNotes} />
    </OverlayBody>
    <OverlayFooter>
      <button type="button" class="secondary" onclick={() => (notesOpen = false)}>
        Close
      </button>
      <button
        type="button"
        onclick={() => {
          notesOpen = false;
          onInstall();
        }}
        disabled={busy}
      >
        Install update
      </button>
    </OverlayFooter>
  </OverlayRoot>
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 640;
  }

  .versions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    opacity: 0.75;
  }

  .available {
    padding: 0 0.5rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.12);
    opacity: 1;
  }

  .outcome {
    margin: 0;
    padding: 0.75rem 0.875rem;
    border-radius: 0.5rem;
    border-inline-start: 3px solid currentColor;
    background: rgb(255 255 255 / 0.06);
    font-size: 0.875rem;
  }

  .outcome strong {
    display: block;
    margin-bottom: 0.125rem;
  }

  .outcome[data-tone="success"] {
    color: #8fd7a6;
  }

  .outcome[data-tone="warning"] {
    color: #e8bd77;
  }

  .outcome[data-tone="progress"],
  .outcome[data-tone="neutral"] {
    color: inherit;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .automatic {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    font-size: 0.875rem;
  }

  .automatic small {
    display: block;
    margin-top: 0.125rem;
    opacity: 0.7;
  }

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.5rem;
    background: rgb(255 255 255 / 0.92);
    color: #16151a;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  button.secondary {
    background: rgb(255 255 255 / 0.12);
    color: inherit;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
