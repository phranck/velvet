<script lang="ts">
  import type { ManageableInstallation } from "@velvet/contracts";

  import {
    createConfiguratorClient,
    ConfiguratorError,
    type ConfiguratorFailure,
  } from "./client.js";

  /**
   * The client this page talks to the service through.
   *
   * Built here rather than taken as a prop. Nothing mounts this component with
   * one: the browser tests answer over HTTP against a built copy, which is
   * what a visitor gets, and the client's own behaviour is tested directly.
   */
  const service = createConfiguratorClient();

  type Opening =
    | { state: "loading" }
    | { state: "failed"; reason: ConfiguratorFailure }
    | {
        state: "ready";
        login: string;
        installations: ManageableInstallation[];
        truncated: boolean;
      };

  let opening = $state<Opening>({ state: "loading" });
  let chosenRepositoryId = $state<number | null>(null);

  /**
   * The installation being configured, or null whilst none is.
   *
   * Derived from the identifier rather than held as the record itself, so a
   * reloaded listing cannot leave a stale copy of a repository on screen.
   */
  const chosen = $derived(
    opening.state === "ready"
      ? (opening.installations.find(
          (installation) => installation.repositoryId === chosenRepositoryId,
        ) ?? null)
      : null,
  );

  /**
   * What went wrong, in a sentence rather than a code.
   *
   * The cause never reaches here. The service records it against an error id;
   * what a reader needs is whether waiting helps.
   */
  const failureMessage: Record<ConfiguratorFailure, string> = {
    unreachable:
      "The setup service did not answer. It may be restarting, so this is worth trying again in a moment.",
    unreadable:
      "The setup service answered something this page cannot read. Trying again is worth it; if it keeps happening, the service and this page are of different versions.",
  };

  /**
   * Asks the service who is signed in and what they may configure.
   *
   * A single installation is chosen straight away, because offering a choice
   * of one is asking somebody to confirm what was never in question.
   */
  async function open(): Promise<void> {
    opening = { state: "loading" };
    try {
      const found = await service.open();
      opening = {
        state: "ready",
        login: found.login,
        installations: found.installations,
        truncated: found.truncated,
      };
      chosenRepositoryId = found.installations[0]?.repositoryId ?? null;
    } catch (cause) {
      opening = {
        state: "failed",
        reason: cause instanceof ConfiguratorError ? cause.reason : "unreadable",
      };
    }
  }

  // Started as the component is created rather than from an effect. Opening is
  // something this page does once, not something it does in response to a
  // change, and an effect is re-run whenever anything it read moves.
  void open();
</script>

<main class="configurator">
  {#if opening.state === "loading"}
    <p class="notice">Reading your installations…</p>
  {:else if opening.state === "failed"}
    <section class="notice notice--failed">
      <h1>The configurator could not start</h1>
      <p>{failureMessage[opening.reason]}</p>
      <button type="button" class="action" onclick={() => void open()}>
        Try again
      </button>
    </section>
  {:else if opening.installations.length === 0}
    <section class="notice">
      <h1>There is nothing to configure yet</h1>
      <p>
        Signed in as {opening.login}. None of the repositories you granted
        access to carries a Velvet installation, so there is no page to change
        the appearance of.
      </p>
      <a class="action" href="/onboarding/">Set Velvet up</a>
    </section>
  {:else}
    <section class="chooser">
      <h1>Choose an installation</h1>
      <p class="chooser__account">Signed in as {opening.login}.</p>
      {#if opening.truncated}
        <p class="chooser__truncated">
          This is not the whole list. The search stopped at its own limit, so an
          installation you expect may be missing rather than absent.
        </p>
      {/if}
      <ul class="chooser__list">
        {#each opening.installations as installation (installation.repositoryId)}
          <li>
            <button
              type="button"
              class="chooser__item"
              aria-pressed={installation.repositoryId === chosenRepositoryId}
              onclick={() => (chosenRepositoryId = installation.repositoryId)}
            >
              <span class="chooser__name">
                {installation.owner}/{installation.name}
              </span>
              <span class="chooser__version">
                Velvet {installation.installedVersion}
              </span>
            </button>
          </li>
        {/each}
      </ul>
      {#if chosen}
        <p class="chooser__chosen">
          Configuring <strong>{chosen.owner}/{chosen.name}</strong>.
        </p>
      {/if}
    </section>
  {/if}
</main>

<style>
  .configurator {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .notice,
  .chooser {
    max-width: 34rem;
    padding: 2rem;
    border: 1px solid var(--config-rule);
    border-radius: 1rem;
    background: var(--config-panel);
  }

  h1 {
    margin: 0 0 1rem;
    font-family: var(--config-font-heading);
    font-size: var(--config-text-copy);
    font-weight: 400;
  }

  p {
    margin: 0 0 1rem;
    color: var(--config-muted);
    line-height: 1.5;
  }

  .notice--failed h1 {
    color: var(--config-outage);
  }

  .action {
    display: inline-block;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--config-accent);
    color: var(--config-on-accent);
    font-family: var(--config-font-label);
    font-size: var(--config-text-label);
    letter-spacing: var(--config-tracking-label);
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
  }

  .chooser__account,
  .chooser__truncated {
    font-size: var(--config-text-small);
  }

  .chooser__truncated {
    color: var(--config-dim);
  }

  .chooser__list {
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.5rem;
  }

  .chooser__item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--config-rule);
    border-radius: 0.5rem;
    background: var(--config-panel-raised);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  /* The chosen item carries the accent and a tint behind it, because colour
     alone asks a reader to compare two shades of the same surface. */
  .chooser__item[aria-pressed="true"] {
    border-color: var(--config-accent);
    background: var(--config-accent-tint);
  }

  .chooser__version {
    color: var(--config-dim);
    font-size: var(--config-text-small);
  }

  .chooser__chosen {
    margin: 0;
    color: var(--config-text);
    font-size: var(--config-text-small);
  }
</style>
