<script lang="ts">
  import type { VelvetConfig } from "../lib/config";
  import {
    barsForRange,
    overallStatus,
    RANGE_LABEL,
    uptimeForRange,
    visibleIncidentEvents,
  } from "../lib/data";
  import { iconFor } from "../lib/icons";
  import { VELVET_VERSION } from "../lib/velvet-version.generated.js";
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
      onclick={() => onToggleAll(!allOpen)}
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

  {#snippet serviceRow(service: StatusDocument["services"][number])}
    <ServiceRow
      {service}
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
      onToggle={() => onToggleService(service.id)}
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
      <section class="card">
        {@render serviceRow(service)}
      </section>
    {/each}
  {:else}
    <section class="card">
      <div class="group-head">
        <span class="group-name">{config.name.toUpperCase()}</span>
        {@render rangeButtons()}
        {@render toggleAllButton()}
      </div>
      {#each services as service (service.id)}
        {@render serviceRow(service)}
      {/each}
    </section>
  {/if}

  <!--
    The Velvet an installation is running, printed where a build stamp belongs.

    Taken from the module the release writes rather than from the repository,
    because a published page has no repository to read: it is a static build,
    and the version that built it is the version it runs.
  -->
  <p class="stamp build mono" data-velvet-version>v{VELVET_VERSION}</p>

  {#if serialLabel}
    <!--
      The number this installation was issued, labelled the way the onboarding
      footer labels it and standing opposite the version. Both stamp the
      installation rather than saying anything about its services, so both are
      dimmed to the same degree: what a reader came for is the services, and a
      stamp that competed with them would be the wrong way round.

      Shown only where there is one: an installation from before serials existed
      has no number, and inventing a placeholder would claim something untrue
      about it.
    -->
    <p class="stamp serial mono" data-status-serial>Serial #{serialLabel}</p>
  {/if}

  {#if config.showPoweredBy}
    <div class="powered">
      <span class="powered-label">powered by</span>
      <VelvetWordmark
        href="https://github.com/phranck/velvet"
        target="_blank"
        rel="noopener noreferrer"
      />
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

    /*
      How far the version and the serial stand from the window's bottom
      corners. One pair for both, so the two stamps cannot drift apart.
    */
    --page-stamp-inset-inline: 10px;
    --page-stamp-inset-block: 8px;
    max-width: var(--service-card-max-width);
    min-height: var(--status-page-min-height, 100vh);
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    padding: 0;
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
    transition: transform var(--velvet-disclosure-duration) ease-in-out;
  }
  .toggle-all i.expanded {
    transform: rotate(180deg);
  }
  /*
    What stamps the installation itself rather than describing its services:
    the version on the left, the serial on the right. Both are held to the
    window's bottom corners, so they stay opposite each other however long the
    page runs, and both read from the one pair of insets below.
  */
  /*
    Both stamps read alike, so only the corner they sit in differs. Everything
    else is stated here once rather than twice, which is what keeps them looking
    like a pair when either is changed.
  */
  .stamp {
    position: fixed;
    bottom: var(--page-stamp-inset-block);
    margin: 0;
    color: var(--text-faint);
    font-size: 11px;
    letter-spacing: 0.04em;
    pointer-events: none;
    user-select: none;
  }
  .build {
    left: var(--page-stamp-inset-inline);
  }
  .serial {
    right: var(--page-stamp-inset-inline);
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
