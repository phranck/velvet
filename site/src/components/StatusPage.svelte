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
  import type {
    IncidentsDocument,
    RangeKey,
    ResponseTimesDocument,
    StatusDocument,
  } from "../lib/types";
  import Incidents from "./Incidents.svelte";
  import ServiceRow from "./ServiceRow.svelte";
  import StatusHero from "./StatusHero.svelte";
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
  const services = $derived(statusDocument.services);
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
    margin: 6px 18px;
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
    transition: transform 160ms ease-in-out;
  }
  .toggle-all i.expanded {
    transform: rotate(180deg);
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
