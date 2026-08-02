<script lang="ts">
  import {
    OverlayBody,
    OverlayFooter,
    OverlayHeader,
    OverlayRoot,
  } from "../overlay/index.js";
  import ConsentCheckbox from "../ConsentCheckbox.svelte";
  import ReleaseNotes from "../release-notes/ReleaseNotes.svelte";
  import { describeUpdate, isUpdateRunning } from "../../lib/update-state.js";
  import type { InstallationUpdate } from "../../lib/update-client.js";
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
    listedAsReference,
    onListedChange,
  }: {
    installedVersion: string;
    release: InstallationUpdate;
    automaticSecurityUpdates: boolean;
    updateState?: ManagedUpdateState;
    updateReason?: ManagedUpdateReason;
    onInstall: () => void;
    onAutomaticChange: (enabled: boolean) => void;
    /** Whether the owner agrees, or `null` when the service does not say. */
    listedAsReference: boolean | null;
    onListedChange: (listed: boolean) => void;
  } = $props();

  let notesOpen = $state(false);

  const outcome = $derived(
    updateState ? describeUpdate(updateState, updateReason) : null,
  );
  const busy = $derived(outcome !== null && isUpdateRunning(outcome));
  // An update is only offered when the service reports a different version, so
  // an installation already on the newest release shows no call to action.
  const updateAvailable = $derived(
    release.availableVersion !== installedVersion,
  );

  /**
   * How a release is labelled for a reader.
   *
   * The classification is enforced at publication against the version step, so
   * a feature cannot be published as a security patch. Showing it matters
   * because the automatic setting below treats these three differently, and a
   * preference about a category the reader cannot see is not a real choice.
   */
  const kind = $derived(
    release.releaseType === "security"
      ? { label: "Security update", icon: "ph-shield-check", tone: "security" }
      : release.releaseType === "fix"
        ? { label: "Fix", icon: "ph-wrench", tone: "normal" }
        : { label: "Feature", icon: "ph-sparkle", tone: "normal" },
  );

  // Only a release the service marked eligible installs unattended, and only
  // while the reader leaves the preference on.
  const installsItself = $derived(
    release.automaticInstallEligible && automaticSecurityUpdates,
  );
</script>

<div class="update">
  <p class="versions">
    <span>Installed {installedVersion}</span>
    {#if updateAvailable}
      <span class="available">{release.availableVersion}</span>
      <span class="kind" data-tone={kind.tone}>
        <i class={`ph-duotone ${kind.icon}`} aria-hidden="true"></i>
        {kind.label}
      </span>
    {/if}
  </p>

  {#if updateAvailable && installsItself}
    <p class="self-installing">
      <i class="ph-duotone ph-clock-countdown" aria-hidden="true"></i>
      Velvet installs this one for you shortly, because it is a security update
      that needs no migration. Turn the setting below off to decide yourself.
    </p>
  {/if}

  {#if outcome}
    <p class="outcome" data-tone={outcome.tone} role="status">
      <strong>{outcome.title}</strong>
      {outcome.detail}
    </p>
  {/if}

  {#if updateAvailable}
    <div class="actions" class:single={installsItself}>
      <button
        type="button"
        class="button secondary"
        onclick={() => (notesOpen = true)}
      >
        <i class="ph-duotone ph-scroll" aria-hidden="true"></i>
        Release notes
      </button>
      {#if !installsItself}
        <button
          type="button"
          class="button primary"
          onclick={onInstall}
          disabled={busy}
        >
          <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          Install update
        </button>
      {/if}
    </div>
  {:else if !outcome}
    <p class="outcome" data-tone="success" role="status">
      <strong>Up to date</strong>
      Your status page is running the newest Velvet version.
    </p>
  {/if}

  <ConsentCheckbox
    checked={automaticSecurityUpdates}
    onchange={onAutomaticChange}
  >
    Install safe security updates automatically
    {#snippet note()}
      Only security releases that need no configuration or data migration.
      Everything else always waits for you.
    {/snippet}
  </ConsentCheckbox>

  <!--
    Worded as it is in the onboarding, which is where this was first agreed to
    or declined. Somebody coming back to change their mind should recognise the
    sentence they answered rather than have to work out that it is the same
    question.
  -->
  {#if listedAsReference !== null}
    <ConsentCheckbox checked={listedAsReference} onchange={onListedChange}>
      Show this status page as a reference on the
      <a
        href="https://velvet.li/references"
        target="_blank"
        rel="noopener noreferrer"
        onclick={(event) => event.stopPropagation()}
      >Velvet website</a>
      {#snippet note()}
        Off unless you turn it on. Only the page itself is shown, never the
        repository behind it.
      {/snippet}
    </ConsentCheckbox>
  {/if}
</div>

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
    <button
      type="button"
      class="button secondary"
      onclick={() => (notesOpen = false)}
    >
      Close
    </button>
    {#if !installsItself}
      <button
        type="button"
        class="button primary"
        onclick={() => {
          notesOpen = false;
          onInstall();
        }}
        disabled={busy}
      >
        Install update
      </button>
    {/if}
  </OverlayFooter>
</OverlayRoot>

<style>
  .update {
    /* The tool's own palette, handed to the shared parts that ask for one. */
    --consent-text: var(--tool-text);
    --consent-muted: var(--tool-muted);
    --consent-accent: var(--tool-accent);
    --consent-checked: var(--tool-accent);
    --consent-link: var(--tool-accent);
    --consent-font-size: 16px;

    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--tool-text);
    font-size: 17px;
  }

  .versions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px 11px;
    margin: 0;
    color: var(--tool-muted);
    font-size: 16px;
  }

  .available {
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 60%, var(--tool-line));
    border-radius: 8px;
    color: var(--tool-accent);
  }

  .kind {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border: 1px solid var(--tool-line);
    border-radius: 8px;
    color: var(--tool-muted);
  }

  /* A security release is the one category the automatic setting acts on, so
     it is the one that must stand out. */
  .kind[data-tone="security"] {
    border-color: color-mix(in srgb, var(--tool-error) 55%, var(--tool-line));
    color: var(--tool-error);
  }

  .kind i {
    font-size: 17px;
  }

  .self-installing {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    color: var(--tool-muted);
    font-size: 16px;
  }

  .self-installing i {
    color: var(--tool-accent);
    font-size: 17px;
  }

  .outcome {
    margin: 0;
    padding: 9px 11px;
    border: 1px solid var(--tool-line);
    border-radius: 8px;
    background: var(--tool-input);
    color: var(--tool-muted);
    font-size: 16px;
  }

  .outcome strong {
    display: block;
    margin-bottom: 2px;
    color: var(--tool-text);
  }

  .outcome[data-tone="success"] strong {
    color: var(--tool-accent);
  }

  .outcome[data-tone="warning"] strong {
    color: var(--tool-error);
  }

  /* Matches the file actions at the top of the Configurator, where paired
     buttons share the available width rather than sitting flush right. */
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  /* Nothing to install by hand, so the remaining action takes the full width. */
  .actions.single {
    grid-template-columns: 1fr;
  }

  .button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 11px;
    border: 1px solid var(--tool-line);
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
    font-size: 17px;
    font-weight: 600;
  }

  .button i {
    font-size: 17px;
  }

  .button.secondary {
    background: var(--tool-panel-raised);
    color: var(--tool-text);
  }

  .button.primary {
    border-color: color-mix(in srgb, var(--tool-accent) 60%, var(--tool-line));
    background: var(--tool-accent);
    color: #10131c;
  }

  .button:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .button:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }
</style>
