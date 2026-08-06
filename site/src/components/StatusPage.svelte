<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { VelvetConfig } from "../lib/config";
  import {
    barsForRange,
    overallStatus,
    RANGE_LABEL,
    uptimeForRange,
    visibleIncidentEvents,
  } from "../lib/data";
  import { iconFor } from "../lib/icons";
  import {
    createViewTransitionController,
    type ViewTransitionController,
  } from "../lib/view-transition";
  import type {
    IncidentsDocument,
    RangeKey,
    ResponseTimesDocument,
    StatusDocument,
  } from "../lib/types";
  import Incidents from "./Incidents.svelte";
  import ServiceRow from "./ServiceRow.svelte";
  import StatusHero from "./StatusHero.svelte";
  import FirstRunNotice from "./FirstRunNotice.svelte";
  import VelvetWordmark from "./VelvetWordmark.svelte";

  let {
    config,
    statusDocument,
    responseTimesDocument,
    incidentsDocument,
    range,
    openMap,
    updated,
    showNavigation = true,
    onSelectRange,
    onToggleAll,
    onToggleService,
  }: {
    config: VelvetConfig;
    statusDocument: StatusDocument;
    responseTimesDocument: ResponseTimesDocument;
    incidentsDocument: IncidentsDocument;
    range: RangeKey;
    openMap: Record<string, boolean>;
    updated: string;
    showNavigation?: boolean;
    onSelectRange: (range: RangeKey) => void;
    onToggleAll: (open: boolean) => void;
    onToggleService: (serviceId: string) => void;
  } = $props();

  const ranges: { key: RangeKey; label: string }[] = [
    { key: "day", label: "24h" },
    { key: "week", label: "7d" },
    { key: "month", label: "30d" },
    { key: "quarter", label: "90d" },
    { key: "year", label: "1yr" },
  ];
  /**
   * How often the installed status workflow checks, in minutes.
   *
   * The status workflow an installation runs schedules itself every five
   * minutes, so this is a property of what Velvet installs rather than a number
   * this page invented. It is stated once here so the notice below can say it
   * without guessing.
   */
  const CHECK_INTERVAL_MINUTES = 5;
  const services = $derived(statusDocument.services);
  /**
   * Whether the page has any history at all to show.
   *
   * True for the whole of an installation's first day and never again, because
   * one finished day is enough to make the bars mean something. Read from the
   * data rather than from a stored date, so nothing has to remember when setup
   * happened and nothing has to clear the notice afterwards.
   */
  const hasNoHistory = $derived(
    services.length > 0 &&
      services.every((service) => service.dailyAvailability.length === 0),
  );
  const incidents = $derived(
    visibleIncidentEvents(incidentsDocument.events),
  );
  const overall = $derived(overallStatus(services));
  const navbarLinks = $derived(
    config.navbar.filter(({ href }) => href.trim() !== "/"),
  );
  const allOpen = $derived(
    services.length > 0 && services.every((service) => openMap[service.id]),
  );
  let viewTransitions: ViewTransitionController | null = null;

  function reducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function transitionState(update: () => void): void {
    if (!viewTransitions) {
      update();
      return;
    }

    viewTransitions.update(
      async () => {
        update();
        await tick();
      },
      reducedMotion(),
    );
  }

  onMount(() => {
    viewTransitions = createViewTransitionController(document);
    return () => viewTransitions?.destroy();
  });
  /** Padded to five digits, the way a board prints a unit number. */
  const serialLabel = $derived(
    typeof config.serial === "number" ? String(config.serial).padStart(5, "0") : "",
  );
</script>

<main class="status-page" data-layout={config.layout}>
  {#if showNavigation}
    <nav class="nav">
      <a class="brand" href={config.url ?? "/"} aria-label={config.name}>
        {#if config.logoUrl}
          <img class="logo" src={config.logoUrl} alt={config.name} />
        {:else}
          {config.name}
        {/if}
      </a>
      {#each navbarLinks as link (link.href)}
        <a class="navlink" href={link.href}>{link.title}</a>
      {/each}
    </nav>
  {/if}

  <StatusHero status={overall} {updated} />
  {#if hasNoHistory}
    <FirstRunNotice checkIntervalMinutes={CHECK_INTERVAL_MINUTES} />
  {/if}
  <Incidents {incidents} />

  {#snippet rangeButtons()}
    <div class="ranges">
      {#each ranges as option (option.key)}
        <button
          class:on={range === option.key}
          onclick={() => onSelectRange(option.key)}
        >{option.label}</button>
      {/each}
    </div>
  {/snippet}

  {#snippet toggleAllButton()}
    <button
      class="toggle-all"
      onclick={() => transitionState(() => onToggleAll(!allOpen))}
      title={allOpen ? "Collapse all" : "Expand all"}
      aria-label={allOpen ? "Collapse all" : "Expand all"}
    >
      <i
        class="ph-duotone ph-caret-circle-double-down"
        class:expanded={allOpen}
        aria-hidden="true"
      ></i>
    </button>
  {/snippet}

  {#snippet serviceRow(
    service: StatusDocument["services"][number],
    transitionName?: string,
  )}
    <ServiceRow
      {service}
      {transitionName}
      icon={iconFor(service.id, config.icons)}
      days={barsForRange(
        service,
        range,
        statusDocument.generatedAt,
        statusDocument.monitoringStartedAt,
        incidentsDocument.events,
      )}
      uptime={uptimeForRange(
        service,
        range,
        statusDocument.generatedAt,
        statusDocument.monitoringStartedAt,
      )}
      rangeLabel={RANGE_LABEL[range]}
      {range}
      generatedAt={responseTimesDocument.generatedAt}
      responseSeries={responseTimesDocument.series.filter(
        ({ serviceId }) => serviceId === service.id,
      )}
      open={openMap[service.id] === true}
      onToggle={() => transitionState(() => onToggleService(service.id))}
      chart={config.theme.chart}
    />
  {/snippet}

  {#if config.layout === "cards"}
    <div class="range-bar">
      <span class="group-name">{config.name.toUpperCase()}</span>
      {@render rangeButtons()}
      {@render toggleAllButton()}
    </div>
    {#each services as service (service.id)}
      <section
        class="card"
        style={`view-transition-name: service-${service.id}`}
      >
        {@render serviceRow(service)}
      </section>
    {/each}
  {:else}
    <!-- Every part that keeps its own shape is named separately, so the browser
         moves each one whilst only the card behind them is stretched. Naming
         the card alone made one image of the whole group stretch, which is
         what the grouped layout looked wrong doing. -->
    <section class="card" style="view-transition-name: service-group">
      <div class="group-head" style="view-transition-name: service-group-head">
        <span class="group-name">{config.name.toUpperCase()}</span>
        {@render rangeButtons()}
        {@render toggleAllButton()}
      </div>
      {#each services as service (service.id)}
        {@render serviceRow(service, `service-${service.id}`)}
      {/each}
    </section>
  {/if}

  {#if config.showPoweredBy}
    <div class="powered">
      <span class="powered-label">powered by</span>
      <VelvetWordmark
        href="https://github.com/phranck/velvet"
        target="_blank"
        rel="noopener noreferrer"
      />
      {#if serialLabel}
        <!--
          The number this installation was issued, printed the way a board
          prints a unit number. Shown only where there is one: an installation
          from before serials existed has no number, and inventing a placeholder
          would claim something untrue about it.
        -->
        <span class="serial" data-status-serial>{serialLabel}</span>
      {/if}
    </div>
  {/if}
</main>

<style>
  .status-page {
    /*
      How far everything inside the page stands in from its edge: the cards,
      the incidents above them, and any notice above those.

      Stated once and inherited, because the page is held to the width somebody
      configures whilst a card is that width less this inset twice. Anything
      that reads the configured width directly ends up as wide as the page and
      therefore wider than the cards it introduces, which is what a notice did
      until it read this instead.
    */
    --status-content-inset: 18px;
    max-width: var(--service-card-max-width);
    min-height: var(--status-page-min-height, 100vh);
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    padding: 0;
  }
  :global(html:active-view-transition) {
    view-transition-name: none;
  }
  :global(::view-transition-group(*)) {
    animation-duration: 200ms;
    animation-timing-function: ease-in-out;
  }
  .nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 32px 22px 20px;
    border-bottom: 1px solid var(--border-soft);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--text);
    font-size: 17px;
    font-weight: 600;
  }
  .logo {
    display: block;
    width: auto;
    max-width: 100%;
    height: var(--logo-height);
  }
  .navlink {
    color: var(--text-muted);
    font-size: 15px;
  }
  .card {
    margin: 6px var(--status-content-inset);
    border: var(--card-border-width) solid var(--card-border);
    border-radius: var(--card-radius);
    background: color-mix(
      in srgb,
      var(--chart-background) var(--chart-background-opacity),
      var(--card-background)
    );
    box-shadow: var(--card-shadow);
  }
  .group-head {
    display: flex;
    align-items: center;
    padding: var(--card-padding);
    border-bottom: 1px solid var(--border-soft);
  }
  .range-bar {
    display: flex;
    align-items: center;
    margin: 6px 32px 2px;
  }
  .group-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ranges {
    display: flex;
    gap: 4px;
  }
  .ranges button {
    padding: 3px 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    font: inherit;
    font-size: 13.5px;
  }
  .ranges button.on {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent-bright);
  }
  .toggle-all {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    transition:
      color 0.12s ease,
      background 0.12s ease;
  }
  .toggle-all:hover {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent-bright);
  }
  .toggle-all i {
    width: 22px;
    height: 22px;
    display: inline-block;
    flex: none;
    font-size: 22px;
    line-height: 1;
    transition: transform 200ms ease-in-out;
  }
  .toggle-all i.expanded {
    transform: rotate(180deg);
  }
  .serial {
    padding: 0.05rem 0.3rem;
    border-radius: 0.15rem;
    background: color-mix(in srgb, var(--text-tertiary) 60%, transparent);
    color: var(--canvas);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    user-select: none;
  }
  .powered {
    --velvet-wordmark-size: 24px;

    margin: 18px auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    line-height: 1;
  }
  .powered-label {
    font-size: 11px;
    letter-spacing: 0.08em;
  }
  .powered :global(.velvet-wordmark) {
    color: color-mix(in srgb, var(--accent), #fff 35%);
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle-all i {
      transition: none;
    }
  }
</style>
