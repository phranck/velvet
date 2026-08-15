<script lang="ts">
  import { tick } from "svelte";

  import type { ManageableInstallation } from "@velvet/contracts";

  import RainbowScale from "../components/RainbowScale.svelte";
  import VelvetWordmark from "../components/VelvetWordmark.svelte";
  import { OFFERED_THEMES, themeById } from "../lib/themes/catalogue.js";
  import { themeSettingDeclarations } from "../lib/themes/settings.js";

  import {
    createConfiguratorClient,
    ConfiguratorError,
    type ConfiguratorFailure,
  } from "./client.js";
  import InstallationChooser from "./InstallationChooser.svelte";
  import Monitor from "./Monitor.svelte";
  import Section from "./Section.svelte";
  import ThemeChooser from "./ThemeChooser.svelte";
  import {
    clampWidth,
    defaultPreferences,
    loadPreferences,
    MAX_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    moveSection,
    PINNED_SECTION,
    placeSection,
    savePreferences,
    type AnySectionKey,
    type SectionKey,
    type SidebarPreferences,
  } from "./sidebar-state.js";

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
  let chosenInstallation = $state("");
  let chosenTheme = $state(OFFERED_THEMES[0]?.id ?? "velvet");

  /** What the sidebar looked like when this browser last left it. */
  let sidebar = $state<SidebarPreferences>(defaultPreferences());

  /** The titles the sections carry, which is also what their toggles say. */
  const SECTION_TITLES: Record<AnySectionKey, string> = {
    updates: "Updates",
    installation: "Installation",
    theme: "Theme",
    global: "Global settings",
    services: "Services",
    "theme-settings": "Theme settings",
  };

  /**
   * The custom properties the monitor is drawn with.
   *
   * Every feature the chosen theme offers, whether or not anything is set, so
   * the frame never depends on a property nobody declared. What an operator
   * sets arrives here in #551; for now this is what the manifest states.
   */
  const declarations = $derived.by(() => {
    const theme = themeById(chosenTheme);
    if (!theme) return {};
    return Object.fromEntries(
      themeSettingDeclarations(theme.features).map((declaration) => {
        const [property, ...rest] = declaration.replace(/;$/, "").split(":");
        return [property!.trim(), rest.join(":").trim()];
      }),
    );
  });

  const chosen = $derived(
    opening.state === "ready"
      ? (opening.installations.find(
          (installation) => String(installation.repositoryId) === chosenInstallation,
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

  /** Writes the current preferences back, after any change to them. */
  function remember(): void {
    savePreferences(sidebar);
  }

  function toggleSection(key: AnySectionKey): void {
    sidebar.open = sidebar.open.includes(key)
      ? sidebar.open.filter((open) => open !== key)
      : [...sidebar.open, key];
    remember();
  }

  function move(key: SectionKey, by: number): void {
    sidebar.order = moveSection(sidebar.order, key, by);
    remember();
  }

  /** Puts a dragged section where the one it was dropped on stands. */
  function drop(onto: SectionKey, carried: string): void {
    if (!sidebar.order.includes(carried as SectionKey)) return;
    sidebar.order = placeSection(sidebar.order, carried as SectionKey, onto);
    remember();
  }

  /**
   * Drags the sidebar wider or narrower.
   *
   * Pointer events rather than mouse events, so a pen and a touch work as
   * well, and capture so the drag survives the pointer leaving the handle.
   */
  function startResize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebar.width;
    const onMove = (moved: PointerEvent): void => {
      sidebar.width = clampWidth(startWidth + (moved.clientX - startX));
    };
    const onUp = (): void => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      remember();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  /** Nudges the width from the keyboard, for anybody not using a pointer. */
  function resizeByKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 40 : 8;
    if (event.key === "ArrowLeft") sidebar.width = clampWidth(sidebar.width - step);
    else if (event.key === "ArrowRight") sidebar.width = clampWidth(sidebar.width + step);
    else if (event.key === "Home") sidebar.width = MIN_SIDEBAR_WIDTH;
    else if (event.key === "End") sidebar.width = MAX_SIDEBAR_WIDTH;
    else return;
    event.preventDefault();
    remember();
  }

  /** The element whose width moves when the sidebar opens or closes. */
  let panel = $state<HTMLElement | null>(null);

  /**
   * How wide the sidebar is when it is out of the way.
   *
   * Not zero: the button that brings it back has to stay reachable, so what
   * remains is the head with that button in it.
   */
  const COLLAPSED_WIDTH = 52;

  /**
   * Opens or closes the sidebar, animating the one element that changes size.
   *
   * The width of a single element, handed to the browser's own timeline.
   * Everything to the right of it is carried by ordinary layout, so the
   * monitor follows without an animation of its own to keep in step.
   */
  function toggleCollapsed(): void {
    const element = panel;
    const from = element?.getBoundingClientRect().width;
    sidebar.collapsed = !sidebar.collapsed;
    remember();
    if (!element || from === undefined) return;
    const reduced = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;
    const to = sidebar.collapsed ? COLLAPSED_WIDTH : sidebar.width;
    void tick().then(() => {
      element.animate(
        [{ width: `${from}px` }, { width: `${to}px` }],
        { duration: 220, easing: "ease", fill: "none" },
      );
    });
  }

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
      chosenInstallation = found.installations[0]
        ? String(found.installations[0].repositoryId)
        : "";
    } catch (cause) {
      opening = {
        state: "failed",
        reason: cause instanceof ConfiguratorError ? cause.reason : "unreadable",
      };
    }
  }

  sidebar = loadPreferences();
  // Started as the component is created rather than from an effect. Opening is
  // something this page does once, not something it does in response to a
  // change, and an effect is re-run whenever anything it read moves.
  void open();
</script>

{#snippet placeholder(what: string)}
  <p class="placeholder">{what}</p>
{/snippet}

<div class="configurator">
  <aside
    bind:this={panel}
    class="sidebar"
    class:sidebar--collapsed={sidebar.collapsed}
    style="--sidebar-width: {sidebar.width}px; --sidebar-collapsed-width: {COLLAPSED_WIDTH}px"
    aria-label="Configuration"
  >
    <header class="sidebar__head">
      <!--
        The mark and its scale, drawn from the same two components every other
        Velvet surface draws them from, so this reads as the same product
        rather than as a second one. The scale takes its width from the word
        above it rather than from the row.
      -->
      <span class="sidebar__brand">
        <VelvetWordmark />
        <span class="sidebar__scale" aria-hidden="true">
          <RainbowScale />
        </span>
        <!--
          Which of Velvet's surfaces this is, justified to the width of the
          mark above it. A single word cannot be justified by text-align,
          which distributes the space between words and there is none, so the
          letters are laid out as their own items and the row spreads them.
          The label carries the word for anybody who is not looking at it,
          because the letters would otherwise be read out one at a time.
        -->
        <span class="sidebar__surface" aria-label="Configurator">
          {#each "CONFIGURATOR" as letter, index (index)}
            <span aria-hidden="true">{letter}</span>
          {/each}
        </span>
      </span>
      <button
        type="button"
        class="sidebar__collapse"
        aria-expanded={!sidebar.collapsed}
        aria-label={sidebar.collapsed ? "Show the sidebar" : "Hide the sidebar"}
        onclick={toggleCollapsed}
      >
        {sidebar.collapsed ? "»" : "«"}
      </button>
    </header>

    {#if !sidebar.collapsed}
      <div class="sidebar__sections">
        {#if opening.state === "loading"}
          <p class="placeholder">Reading your installations…</p>
        {:else if opening.state === "failed"}
          <div class="failure">
            <h1 class="failure__heading">The configurator could not start</h1>
            <p class="failure__text">{failureMessage[opening.reason]}</p>
            <button type="button" class="action" onclick={() => void open()}>
              Try again
            </button>
          </div>
        {:else if opening.installations.length === 0}
          <div class="failure">
            <h1 class="failure__heading">There is nothing to configure yet</h1>
            <p class="failure__text">
              Signed in as {opening.login}. None of the repositories you granted
              access to carries a Velvet installation, so there is no page to
              change the appearance of.
            </p>
            <a class="action" href="/onboarding/">Set Velvet up</a>
          </div>
        {:else}
          <!--
            The update notices stand at the top and are not part of what
            somebody arranges. What they announce is the one thing that should
            not be arranged out of the way, and they are absent entirely when
            there is nothing to announce.
          -->
          <Section
            key={PINNED_SECTION}
            title={SECTION_TITLES[PINNED_SECTION]}
            open={sidebar.open.includes(PINNED_SECTION)}
            position={0}
            count={1}
            movable={false}
            onToggle={() => toggleSection(PINNED_SECTION)}
            onMove={() => {}}
          >
            {@render placeholder("Nothing to update.")}
          </Section>

          {#each sidebar.order as key, position (key)}
            <Section
              {key}
              title={SECTION_TITLES[key]}
              open={sidebar.open.includes(key)}
              {position}
              count={sidebar.order.length}
              onToggle={() => toggleSection(key)}
              onMove={(by) => move(key, by)}
              onDrop={(carried) => drop(key, carried)}
            >
              {#if key === "installation"}
                <InstallationChooser
                  installations={opening.installations}
                  truncated={opening.truncated}
                  value={chosenInstallation}
                  onChoose={(value) => (chosenInstallation = value)}
                />
              {:else if key === "theme"}
                <ThemeChooser
                  value={chosenTheme}
                  onChoose={(value) => (chosenTheme = value)}
                />
              {:else if key === "global"}
                {@render placeholder("Settings that apply to the whole page.")}
              {:else if key === "services"}
                {@render placeholder("Settings for each monitored service.")}
              {:else}
                {@render placeholder("What the chosen theme lets you change.")}
              {/if}
            </Section>
          {/each}
        {/if}
      </div>

      <footer class="sidebar__foot">
        {#if chosen}
          Configuring {chosen.owner}/{chosen.name}
        {:else if opening.state === "ready"}
          Signed in as {opening.login}
        {/if}
      </footer>
    {/if}
  </aside>

  {#if !sidebar.collapsed}
    <!--
      The window-splitter pattern from WAI-ARIA: a separator that carries a
      value is operable, which is what makes it focusable and what the arrow
      keys act on. Svelte's rule reads every separator as non-interactive and
      does not know the pattern, so the check is switched off here rather than
      the element being made something it is not. A button with this role is
      refused by the same rule from the other direction.
    -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="handle"
      role="separator"
      tabindex="0"
      aria-label="Sidebar width"
      aria-orientation="vertical"
      aria-valuenow={sidebar.width}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      onpointerdown={startResize}
      onkeydown={resizeByKey}
    ></div>
  {/if}

  <Monitor theme={chosenTheme} {declarations} />
</div>

<style>
  .configurator {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    flex: 0 0 auto;
    min-width: 0;
    border-right: 1px solid var(--configurator-divider);
    background: var(--configurator-base);
    overflow: hidden;
  }

  /* Collapsed is a state rather than a width, so nothing has to agree about
     what zero means. What is left is the head, because the button that brings
     the sidebar back lives in it. */
  .sidebar--collapsed {
    width: var(--sidebar-collapsed-width);
  }

  /* The mark sits in the middle of the sidebar rather than beside the button,
     so it is centred on the panel it names. The button is taken out of the
     flow for that reason: left in it, it would push the mark off centre by
     half its own width. */
  .sidebar__head {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.1rem var(--configurator-inset);
    border-bottom: 1px solid var(--configurator-divider);
  }

  .sidebar--collapsed .sidebar__head {
    padding-inline: 0;
  }

  .sidebar__brand {
    display: inline-flex;
    flex-direction: column;
    /* The mark is sized here rather than by the text scale, because it is a
       mark rather than a heading. */
    --velvet-wordmark-size: 1.625rem;
    --velvet-wordmark-display: block;
    --velvet-wordmark-text-align: center;
  }

  /* As tall as a rule and as wide as the word above it, which is what makes it
     read as belonging to the mark rather than as a decoration beside it. */
  .sidebar__scale {
    display: block;
    height: 2px;
    margin-top: 0.1875rem;
  }

  .sidebar__surface {
    display: flex;
    justify-content: space-between;
    margin-top: 0.425rem;
    color: var(--configurator-text);
    font-family: var(--configurator-font-label);
    font-size: var(--configurator-text-label-small);
    line-height: 1;
    /* None: the spread below is what sets the letters apart, and tracking on
       top of it would add a gap after the last one that nothing balances. */
    letter-spacing: normal;
  }

  .sidebar--collapsed .sidebar__brand {
    display: none;
  }

  /* Collapsed there is nothing to centre against, so the button takes the
     middle rather than sitting against an edge that is no longer there. */
  .sidebar--collapsed .sidebar__collapse {
    position: static;
  }

  .sidebar__collapse {
    position: absolute;
    right: var(--configurator-inset);
    width: 2rem;
    height: 2rem;
    font-size: var(--configurator-glyph);
    padding: 0;
    border: 1px solid var(--configurator-divider);
    border-radius: 0.4rem;
    background: var(--configurator-raised);
    color: var(--configurator-text-muted);
    cursor: pointer;
  }

  .sidebar__collapse:hover {
    border-color: var(--configurator-edge);
    color: var(--configurator-text);
  }

  .sidebar__collapse:focus-visible,
  .handle:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  .sidebar__sections {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: var(--configurator-inset);
    overflow-y: auto;
    flex: 1;
  }

  .sidebar__foot {
    padding: 0.6rem var(--configurator-inset);
    border-top: 1px solid var(--configurator-divider);
    color: var(--configurator-text-muted);
    font-size: var(--configurator-text-small);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Wide enough to hit without hunting for it, drawn narrower than it is. */
  .handle {
    flex: 0 0 auto;
    width: 9px;
    margin-inline: -4px;
    cursor: col-resize;
    background: none;
    z-index: 1;
  }

  .placeholder {
    margin: 0;
    color: var(--configurator-text-muted);
    font-size: var(--configurator-text-small);
    line-height: 1.5;
  }

  /* A surface standing on the sidebar, so it carries the stated radius and the
     button in it carries the derived one. */
  .failure {
    padding: var(--configurator-inset);
    border: 1px solid var(--configurator-divider);
    border-radius: var(--configurator-radius);
    background: var(--configurator-raised);
  }

  /* Text in a rounded surface, standing in by half the radius on top of the
     padding. The button below runs its own width and takes none of it. */
  .failure__heading,
  .failure__text {
    padding-inline: var(--configurator-text-inset);
  }

  .failure__heading {
    margin: 0 0 0.5rem;
    font-family: var(--configurator-font-heading);
    font-size: var(--configurator-text-body);
    font-weight: 400;
    color: var(--configurator-accent);
  }

  .failure__text {
    margin: 0 0 0.75rem;
    color: var(--configurator-text-muted);
    font-size: var(--configurator-text-small);
    line-height: 1.5;
  }

  .action {
    display: inline-block;
    padding: 0.5rem 1rem;
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
  }

  .action:hover {
    background: var(--configurator-accent-lit);
  }

  /* Global, because bits-ui renders these elements rather than this template,
     so Svelte's scoping attribute never reaches them. */
  :global(.chooser) {
    display: grid;
    gap: 0.35rem;
  }

  :global(.chooser__item) {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    width: 100%;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--configurator-edge);
    border-radius: var(--configurator-radius-inner);
    background: var(--configurator-sunken);
    color: var(--configurator-text);
    font: inherit;
    font-size: var(--configurator-text-small);
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

  :global(.chooser__name) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.chooser__aside) {
    flex: 0 0 auto;
    color: var(--configurator-text-muted);
  }
</style>
