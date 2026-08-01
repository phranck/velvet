<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { UpdateSection } from "../components/update/index.js";
  import {
    createUpdateClient,
    type InstallationUpdate,
    type ManagedInstallation,
    type UpdateOperation,
    type UpdateResult,
    type VelvetUpdateClient,
  } from "../lib/update-client.js";
  import { describeUpdate, isUpdateRunning } from "../lib/update-state.js";
  import CustomListbox from "./CustomListbox.svelte";

  /**
   * Connects the update section to a real installation.
   *
   * The Configurator edits a file, and an update changes a repository. Those
   * are two different things, and this component is the only place that knows
   * both: it asks the Velvet service which installations the signed-in person
   * administers, and drives one of them. Everything below it stays
   * presentational, and everything around it stays an offline editor.
   */

  let { client = createUpdateClient() }: { client?: VelvetUpdateClient } =
    $props();

  /** How often a running update is asked where it has got to. */
  const POLL_INTERVAL_MS = 4_000;
  /**
   * How long an update is followed before the interface stops watching.
   *
   * A managed update waits for a check run and then for a Pages deployment, so
   * several minutes is normal. Beyond this the operation has not been lost, it
   * is simply no longer worth holding a browser tab open for, and reopening the
   * Configurator picks the same reconciliation back up.
   */
  const MAX_POLL_MS = 15 * 60_000;

  type Connection =
    | { state: "loading" }
    /** No Velvet service answered, which is the normal local case. */
    | { state: "offline" }
    /** A service answered but does not know who this is. */
    | { state: "signed-out" }
    /** Signed in, but nothing this account administers carries a version lock. */
    | { state: "none"; inspected: number; truncated: boolean }
    | { state: "ready" }
    | { state: "error"; message: string; errorId: string };

  let connection = $state<Connection>({ state: "loading" });
  let managed = $state<ManagedInstallation[]>([]);
  let selectedId = $state<string>("");
  let installation = $state<InstallationUpdate | null>(null);
  let operation = $state<UpdateOperation | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const selected = $derived(
    managed.find((entry) => key(entry) === selectedId) ?? null,
  );
  const options = $derived(
    managed.map((entry) => ({
      value: key(entry),
      label: `${entry.owner}/${entry.name}`,
      description: `Velvet ${entry.installedVersion}`,
    })),
  );

  /** Identifies one repository in a single string, for the listbox. */
  function key(entry: ManagedInstallation): string {
    return `${entry.installationId}:${entry.repositoryId}`;
  }

  /** Records whatever a call reported, other than success. */
  function report(result: UpdateResult<unknown>): void {
    if (result.status === "error") {
      connection = {
        state: "error",
        message: result.message,
        errorId: result.errorId,
      };
      return;
    }
    if (result.status === "unauthenticated") {
      connection = { state: "signed-out" };
      return;
    }
    if (result.status === "unavailable") connection = { state: "offline" };
  }

  async function load(): Promise<void> {
    const listed = await client.listInstallations();
    if (listed.status !== "ok") {
      report(listed);
      return;
    }
    // A repository without a version lock was not created by the browser
    // onboarding and cannot receive a managed update, so offering it would
    // promise something that cannot happen.
    managed = listed.data.repositories.filter(
      (entry) => entry.installedVersion !== null,
    );
    if (managed.length === 0) {
      connection = {
        state: "none",
        inspected: listed.data.repositories.length,
        truncated: listed.data.truncated,
      };
      return;
    }
    connection = { state: "ready" };
    selectedId = key(managed[0]!);
    await read();
  }

  async function read(): Promise<void> {
    const target = selected;
    if (!target) return;
    const result = await client.read(target);
    if (result.status === "ok") {
      installation = result.data;
      return;
    }
    installation = null;
    report(result);
  }

  function stopPolling(): void {
    if (pollTimer === null) return;
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  /**
   * Follows one update until it settles.
   *
   * Repeating the same request is how progress is read, because the service
   * reconciles from the repository rather than from anything it remembers, so
   * a poll and a retry are the same call.
   */
  async function follow(deadline: number): Promise<void> {
    const target = selected;
    if (!target || !installation) return;
    const result = await client.start(target, installation.availableVersion);
    if (result.status !== "ok") {
      report(result);
      return;
    }
    operation = result.data;
    if (!isUpdateRunning(describeUpdate(result.data.state, result.data.reason))) {
      await read();
      return;
    }
    if (Date.now() >= deadline) return;
    pollTimer = setTimeout(() => {
      void follow(deadline);
    }, POLL_INTERVAL_MS);
  }

  function install(): void {
    stopPolling();
    void follow(Date.now() + MAX_POLL_MS);
  }

  function setAutomatic(enabled: boolean): void {
    const target = selected;
    if (!target || !installation) return;
    // Shown immediately, then corrected from what the service settled on, so a
    // refused write cannot leave the checkbox claiming something untrue.
    installation = { ...installation, automaticSecurityUpdates: enabled };
    void client.setAutomatic(target, enabled).then((result) => {
      if (result.status === "ok") {
        installation = installation && {
          ...installation,
          automaticSecurityUpdates: result.data,
        };
        return;
      }
      report(result);
      void read();
    });
  }

  function choose(value: string): void {
    stopPolling();
    selectedId = value;
    operation = null;
    installation = null;
    void read();
  }

  onMount(() => {
    void load();
  });

  onDestroy(stopPolling);
</script>

{#if connection.state === "loading"}
  <p class="update-note">Looking for your Velvet installations.</p>
{:else if connection.state === "offline"}
  <p class="update-note">
    This Configurator is editing a file on your computer and is not connected to
    an installation. Open the Configurator at
    <a href="https://setup.velvet.li/configurator/">setup.velvet.li</a>
    and sign in with GitHub to install updates.
  </p>
{:else if connection.state === "signed-out"}
  <p class="update-note">
    Sign in with GitHub to see which of your status pages Velvet can update.
  </p>
  <!-- A full page load, because signing in leaves this origin for GitHub and
       comes back to it. -->
  <a class="button primary" href="/api/auth/start">
    <i class="ph-duotone ph-github-logo" aria-hidden="true"></i>
    Sign in with GitHub
  </a>
{:else if connection.state === "none"}
  <p class="update-note">
    None of the {connection.inspected} repositories Velvet can see carries a
    version lock, so none of them can receive a managed update.
    {#if connection.truncated}
      Velvet stopped short of inspecting every repository, so one may be
      missing.
    {/if}
    An installation created by
    <a href="https://setup.velvet.li/onboarding/">the browser setup</a>
    always has one.
  </p>
{:else if connection.state === "error"}
  <p class="update-note" data-tone="warning" role="status">
    {connection.message}
    <small>Quote {connection.errorId} if you ask for help with this.</small>
  </p>
{:else}
  {#if managed.length > 1}
    <div class="choice">
      <CustomListbox
        id="velvet-update-installation"
        ariaLabel="Installation to manage"
        value={selectedId}
        options={options}
        compact
        onChange={choose}
      />
    </div>
  {/if}

  {#if installation}
    <UpdateSection
      installedVersion={installation.installedVersion ?? ""}
      release={installation}
      automaticSecurityUpdates={installation.automaticSecurityUpdates}
      updateState={operation?.state}
      updateReason={operation?.reason}
      onInstall={install}
      onAutomaticChange={setAutomatic}
    />
  {:else}
    <p class="update-note">Reading this installation.</p>
  {/if}
{/if}

<style>
  .update-note {
    margin: 0;
    color: var(--tool-muted);
    font-size: 16px;
  }

  .update-note[data-tone="warning"] {
    padding: 9px 11px;
    border: 1px solid var(--tool-line);
    border-radius: 8px;
    background: var(--tool-input);
    color: var(--tool-error);
  }

  .update-note small {
    display: block;
    margin-top: 2px;
    color: var(--tool-muted);
    font-size: 16px;
  }

  .update-note a {
    color: var(--tool-accent);
  }

  .choice {
    margin-bottom: 12px;
  }

  /* Matches the actions inside the update section, so signing in looks like
     part of the same control rather than a different kind of thing. */
  .button {
    min-height: 36px;
    margin-top: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 11px;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 60%, var(--tool-line));
    border-radius: 8px;
    background: var(--tool-accent);
    color: #10131c;
    font-size: 17px;
    font-weight: 600;
    text-decoration: none;
  }

  .button:hover {
    filter: brightness(1.08);
  }

  .button:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }

  .button i {
    font-size: 17px;
  }
</style>
