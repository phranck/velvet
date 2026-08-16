<script lang="ts">
  import { tick } from "svelte";

  import type {
    InstallationConfiguration,
    ManageableInstallation,
  } from "@velvet/contracts";

  import RainbowScale from "../components/RainbowScale.svelte";
  import VelvetWordmark from "../components/VelvetWordmark.svelte";
  import { OFFERED_THEMES, themeById } from "../lib/themes/catalogue.js";
  import { themeSettingDeclarations } from "../lib/themes/settings.js";

  import {
    createConfiguratorClient,
    ConfiguratorError,
    type ConfiguratorFailure,
  } from "./client.js";
  import { readDraft, writeDraft } from "./draft.js";
  import InstallationChooser from "./InstallationChooser.svelte";
  import Monitor from "./Monitor.svelte";
  import Section from "./Section.svelte";
  import ThemeChooser from "./ThemeChooser.svelte";
  import ThemeSettings from "./ThemeSettings.svelte";
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

  /**
   * What the chosen installation is published in today.
   *
   * Read from the operator's own configuration rather than assumed, so the
   * configurator opens on the theme their page actually carries. Null whilst
   * it is being read, and for a repository that carries no readable
   * configuration at all.
   */
  let published = $state<InstallationConfiguration | null>(null);

  /**
   * What has been changed and not yet published, one set per theme.
   *
   * Kept per theme because the same key means something else in another theme,
   * or nothing at all, so one set shared between them would carry values from
   * a theme that never offered them. Returning to a theme that was already
   * adjusted finds those values again.
   *
   * It survives a reload, because a draft nobody published is still work, and
   * because reloading a page one is working in should not undo it. Publishing
   * it is a separate act, which is #552.
   */
  let drafts = $state<Record<string, Record<string, string | number | boolean>>>(
    {},
  );

  /**
   * What one theme stands at: the draft where there is one, else what is live.
   *
   * The live values count only for the theme the page is actually published
   * in. Every other theme starts from its own defaults, which is what the
   * manifest states and what the controls show.
   */
  function settingsOf(theme: string): Record<string, string | number | boolean> {
    const draft = drafts[theme];
    if (draft) return draft;
    return published?.theme === theme ? { ...published.themeSettings } : {};
  }

  const chosenSettings = $derived(settingsOf(chosenTheme));

  /**
   * What the page currently resolves for each feature's property.
   *
   * Read back from the monitor rather than taken from the manifest, because a
   * theme states many of these itself and a palette moves them. A control for
   * something nobody has set should start at what the page shows, not at what
   * the manifest calls the default: choosing Autumn and seeing the indigo
   * swatch of the default palette is the control describing another page.
   */
  let resolved = $state<Record<string, string>>({});

  /** The properties worth reading back, which is one per feature. */
  const watched = $derived(
    (themeById(chosenTheme)?.features ?? []).flatMap((feature) =>
      feature.type === "arrangement" ? feature.properties : [feature.property],
    ),
  );

  /** Records one setting against the theme it belongs to. */
  function setFeature(key: string, value: string | number | boolean): void {
    drafts = {
      ...drafts,
      [chosenTheme]: { ...settingsOf(chosenTheme), [key]: value },
    };
    keep();
  }

  /**
   * Writes the draft back for whichever installation is being configured.
   *
   * Nothing is written until an installation is known, because a draft belongs
   * to one and there is nowhere to put it before that.
   */
  function keep(): void {
    if (!chosenInstallation) return;
    writeDraft(chosenInstallation, { theme: chosenTheme, settings: drafts });
  }

  /**
   * Whether leaving the current theme is a decision that cannot be undone.
   *
   * True only when the page is published in a withdrawn theme. That is the one
   * change nothing brings back: a withdrawn theme is offered to nobody new, so
   * once the page is out of it there is no way to choose it again.
   */
  const leavingIsFinal = $derived(
    published?.theme === chosenTheme &&
      themeById(chosenTheme)?.state === "withdrawn",
  );

  /**
   * Takes a chosen theme, asking first where the choice cannot be taken back.
   *
   * Asked with the browser's own confirmation rather than a dialogue of our
   * own: this is the one question in the configurator, it has two answers, and
   * a modal built here would be a component nothing else uses.
   *
   * @param theme - The theme somebody chose.
   */
  function chooseTheme(theme: string): void {
    if (theme === chosenTheme) return;
    if (
      leavingIsFinal &&
      !globalThis.confirm(
        `${themeById(chosenTheme)?.name ?? chosenTheme} has been withdrawn. Leaving it is final: it is offered to nobody new, so this page cannot be published in it again.`,
      )
    ) {
      return;
    }
    chosenTheme = theme;
    keep();
  }

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
      themeSettingDeclarations(theme.features, chosenSettings).map((declaration) => {
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
   * How wide the rail down the left-hand side is.
   *
   * The rail stands whether the sidebar is there or not, and the button that
   * shows and hides it lives on the rail rather than on the sidebar. That is
   * what lets the sidebar leave completely: a button riding on it would go
   * with it.
   */
  const RAIL_WIDTH = 40;

  /**
   * Opens or closes the sidebar by sliding it out of the way.
   *
   * It keeps its width throughout and moves instead, so nothing inside it
   * reflows: a sidebar that narrows would squeeze every label and every
   * control on every frame of the way out. What moves is one margin on one
   * element, handed to the browser's own timeline, and the monitor follows by
   * ordinary layout rather than by an animation of its own to keep in step.
   */
  function toggleCollapsed(): void {
    const element = panel;
    const from = element
      ? Number.parseFloat(globalThis.getComputedStyle(element).marginLeft)
      : 0;
    sidebar.collapsed = !sidebar.collapsed;
    remember();
    if (!element) return;
    const reduced = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;
    const to = sidebar.collapsed ? -sidebar.width : 0;
    void tick().then(() => {
      element.animate(
        [{ marginLeft: `${from}px` }, { marginLeft: `${to}px` }],
        { duration: 220, easing: "ease", fill: "none" },
      );
    });
  }

  /**
   * Reads what the chosen installation is published in, and opens on it.
   *
   * A theme the catalogue does not know is not chosen: a page may name a theme
   * this Velvet no longer ships, and starting from something that cannot be
   * drawn is worse than starting from the first one on offer.
   *
   * A failure here is not the configurator failing to start. The installation
   * is known, the themes are known, and only the starting point is missing, so
   * it opens on the first theme rather than on an error.
   *
   * @param installation - The installation to read.
   */
  async function openOn(installation: ManageableInstallation): Promise<void> {
    published = null;
    const repository = String(installation.repositoryId);
    // What this browser was left in the middle of, which outranks what is live:
    // somebody who changed the theme and reloaded is still working on that
    // change, and putting the published one back would undo it.
    const draft = readDraft(repository);
    drafts = draft.settings;
    if (draft.theme && themeById(draft.theme)) chosenTheme = draft.theme;

    let configuration: InstallationConfiguration;
    try {
      configuration = await service.configurationOf(installation);
    } catch {
      return;
    }
    // Another installation may have been chosen whilst this was in flight, and
    // the answer to a question nobody is asking any more is not an answer.
    if (repository !== chosenInstallation) return;
    published = configuration;
    if (!draft.theme && configuration.theme && themeById(configuration.theme)) {
      chosenTheme = configuration.theme;
    }
  }

  $effect(() => {
    const installation = chosen;
    if (installation) void openOn(installation);
  });

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

<div class="configurator" style="--rail-width: {RAIL_WIDTH}px">
  <!--
    The rail stands whether the sidebar does or not, which is what lets the
    sidebar leave completely rather than stopping short so a button on it stays
    reachable. One button in one place for both states, rather than one that
    travels and a second that appears where it went.
  -->
  <div class="rail">
    <!--
      One icon for both states, turned half a circle when the sidebar is away,
      so what somebody sees is the same mark pointing the other way rather than
      two marks to tell apart. The label carries the meaning, because the icon
      is decoration to a screen reader.
    -->
    <button
      type="button"
      class="rail__toggle"
      class:rail__toggle--collapsed={sidebar.collapsed}
      aria-expanded={!sidebar.collapsed}
      aria-label={sidebar.collapsed ? "Show the sidebar" : "Hide the sidebar"}
      onclick={toggleCollapsed}
    >
      <i class="ph-duotone ph-caret-circle-double-left" aria-hidden="true"></i>
    </button>
  </div>

  <aside
    bind:this={panel}
    class="sidebar"
    class:sidebar--collapsed={sidebar.collapsed}
    style="--sidebar-width: {sidebar.width}px"
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
    </header>

    <!--
      Kept in the document whilst the sidebar is away rather than removed and
      rebuilt, because it slides out with its width intact and there is
      nothing to slide otherwise. `inert` is what keeps it out of the way for
      everybody else: off to the left it is out of sight, and without this it
      would still take focus from the keyboard and still be read aloud.
    -->
    <div class="sidebar__sections" inert={sidebar.collapsed}>
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
                published={published?.theme ?? null}
                onChoose={chooseTheme}
              />
            {:else if key === "global"}
              {@render placeholder("Settings that apply to the whole page.")}
            {:else if key === "services"}
              {@render placeholder("Settings for each monitored service.")}
            {:else}
              <ThemeSettings
                features={themeById(chosenTheme)?.features ?? []}
                settings={chosenSettings}
                showing={resolved}
                onChange={setFeature}
              />
            {/if}
          </Section>
        {/each}
      {/if}
    </div>

    <footer class="sidebar__foot" inert={sidebar.collapsed}>
      {#if chosen}
        Configuring {chosen.owner}/{chosen.name}
      {:else if opening.state === "ready"}
        Signed in as {opening.login}
      {/if}
    </footer>
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

  <Monitor
    theme={chosenTheme}
    {declarations}
    themeRoot={themeById(chosenTheme)?.root ?? ""}
    watching={watched}
    onResolved={(values) => (resolved = values)}
  />
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

  /* Away is a position rather than a width. The panel keeps its size and moves
     the whole of itself out to the left, so nothing inside it reflows on the
     way and nothing of it is left showing: its right-hand edge comes to rest
     against the rail's, and the rail is painted over what remains. */
  .sidebar--collapsed {
    margin-left: calc(-1 * var(--sidebar-width));
  }

  /* Above the sidebar, so the last stretch of the panel's travel is hidden
     behind it rather than sliding past it in view. */
  .rail {
    display: flex;
    justify-content: center;
    /* Held at the top rather than stretched, or the button would be as tall as
       the window and the icon would sit in the middle of a column-high
       target. */
    align-items: flex-start;
    flex: 0 0 auto;
    width: var(--rail-width);
    padding-top: 1.1rem;
    border-right: 1px solid var(--configurator-divider);
    background: var(--configurator-base);
    z-index: 1;
  }

  /* The icon alone, with no border and no surface behind it, aligned with the
     top of the wordmark beside it through the padding the rail shares with the
     head. */
  .rail__toggle {
    display: flex;
    padding: 0;
    border: none;
    background: none;
    color: var(--configurator-text-muted);
    font-size: var(--configurator-glyph-large);
    line-height: 1;
    cursor: pointer;
  }

  .rail__toggle:hover {
    color: var(--configurator-text);
  }

  /* Half a circle, so one icon serves both states. The turn takes as long as
     the panel's travel, so the two read as one movement. */
  .rail__toggle > i {
    transition: transform 220ms ease;
  }

  .rail__toggle--collapsed > i {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .rail__toggle > i {
      transition: none;
    }
  }


  /* The mark sits in the middle of the panel it names. Nothing shares the row
     with it, because the button that shows and hides the panel stands on the
     rail instead. */
  .sidebar__head {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.1rem var(--configurator-inset);
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

  .rail__toggle:focus-visible,
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
    border: 1px solid var(--configurator-control-edge);
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
