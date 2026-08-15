<script lang="ts">
  import { RadioGroup } from "bits-ui";

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

  /**
   * The chosen repository, as the string a radio group carries.
   *
   * Radio values are strings and the identifier is a number, so it travels as
   * text here and is compared as text. Holding both would be two
   * representations of one answer and a place for them to disagree.
   */
  let chosenValue = $state("");

  /**
   * The installation being configured, or null whilst none is.
   *
   * Derived from the identifier rather than held as the record itself, so a
   * reloaded listing cannot leave a stale copy of a repository on screen.
   */
  const chosen = $derived(
    opening.state === "ready"
      ? (opening.installations.find(
          (installation) => String(installation.repositoryId) === chosenValue,
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
      chosenValue = found.installations[0]
        ? String(found.installations[0].repositoryId)
        : "";
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
    <section class="panel">
      <p class="panel__text">Reading your installations…</p>
    </section>
  {:else if opening.state === "failed"}
    <section class="panel">
      <h1 class="panel__heading panel__heading--failed">
        The configurator could not start
      </h1>
      <p class="panel__text">{failureMessage[opening.reason]}</p>
      <button type="button" class="action" onclick={() => void open()}>
        Try again
      </button>
    </section>
  {:else if opening.installations.length === 0}
    <section class="panel">
      <h1 class="panel__heading">There is nothing to configure yet</h1>
      <p class="panel__text">
        Signed in as {opening.login}. None of the repositories you granted
        access to carries a Velvet installation, so there is no page to change
        the appearance of.
      </p>
      <a class="action" href="/onboarding/">Set Velvet up</a>
    </section>
  {:else}
    <section class="panel">
      <h1 class="panel__heading">Choose an installation</h1>
      <p class="panel__text panel__text--small">Signed in as {opening.login}.</p>
      {#if opening.truncated}
        <p class="panel__text panel__text--small panel__text--dim">
          This is not the whole list. The search stopped at its own limit, so an
          installation you expect may be missing rather than absent.
        </p>
      {/if}
      <RadioGroup.Root
        class="chooser"
        bind:value={chosenValue}
        aria-label="Velvet installations you may configure"
      >
        {#each opening.installations as installation (installation.repositoryId)}
          <RadioGroup.Item
            class="chooser__item"
            value={String(installation.repositoryId)}
          >
            <span class="chooser__name">
              {installation.owner}/{installation.name}
            </span>
            <span class="chooser__version">
              Velvet {installation.installedVersion}
            </span>
          </RadioGroup.Item>
        {/each}
      </RadioGroup.Root>
      {#if chosen}
        <p class="panel__text panel__text--small panel__chosen">
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

  /*
    The one surface on this page, and the reference every rounding below is
    measured against. Its padding is equal on all four sides: what usually
    reads as more air at the sides comes from the text inset instead.
  */
  .panel {
    width: 100%;
    max-width: 32rem;
    padding: var(--configurator-inset);
    border: 1px solid var(--configurator-divider);
    border-radius: var(--configurator-radius);
    background: var(--configurator-raised);
  }

  /* Text meets the panel's own corner, so it stands in by half the radius on
     top of the padding. The list below takes none of this: each of its items
     draws an edge of its own. */
  .panel__heading,
  .panel__text {
    padding-inline: var(--configurator-text-inset);
  }

  .panel__heading {
    margin: 0 0 0.75rem;
    font-family: var(--configurator-font-heading);
    font-size: var(--configurator-text-heading);
    font-weight: 400;
  }

  .panel__heading--failed {
    color: var(--configurator-accent);
  }

  .panel__text {
    margin: 0 0 0.75rem;
    color: var(--configurator-text-muted);
    line-height: 1.5;
  }

  .panel__text--small {
    font-size: var(--configurator-text-small);
  }

  .panel__text--dim {
    color: var(--configurator-edge);
  }

  .panel__chosen {
    margin-bottom: 0;
    color: var(--configurator-text);
  }

  /* Sits inside the panel, so its radius is the panel's less the distance to
     it. Anything else pinches at the corner. */
  .action {
    display: inline-block;
    margin-inline: var(--configurator-text-inset);
    padding: 0.55rem 1.1rem;
    border: none;
    border-radius: var(--configurator-radius-inner);
    background: var(--configurator-accent);
    color: var(--configurator-accent-ink);
    font-family: var(--configurator-font-label);
    font-size: var(--configurator-text-label);
    letter-spacing: var(--configurator-tracking-label);
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--configurator-transition);
  }

  .action:hover,
  .action:focus-visible {
    background: var(--configurator-accent-lit);
  }

  /* Global, because bits-ui renders these elements rather than this template,
     so Svelte's scoping attribute never reaches them. */
  :global(.chooser) {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  /*
    One item of the list, which is a radio rather than a toggle. bits-ui gives
    it arrow-key navigation, roving focus, and aria-checked; this draws it.
  */
  :global(.chooser__item) {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    width: 100%;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--configurator-edge);
    border-radius: var(--configurator-radius-inner);
    background: var(--configurator-sunken);
    color: var(--configurator-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--configurator-transition),
      background var(--configurator-transition);
  }

  /* The current item carries the accent and the accent behind it. Hover adds
     the lit edge and leaves that surface alone, because taking it away would
     make the current item stop looking current whilst the pointer is on it. */
  :global(.chooser__item[data-state="checked"]) {
    border-color: var(--configurator-accent);
    background: var(--configurator-accent-surface);
  }

  :global(.chooser__item:hover) {
    border-color: var(--configurator-accent-lit);
  }

  :global(.chooser__item:focus-visible) {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  :global(.chooser__version) {
    color: var(--configurator-text-muted);
    font-size: var(--configurator-text-small);
  }
</style>
