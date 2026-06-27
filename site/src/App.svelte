<script lang="ts">
  import { onMount } from "svelte";
  import {
    RANGE_DAYS,
    dailyBars,
    fetchIncidents,
    fetchMonitoringStart,
    fetchSummary,
    overallStatus,
    uptimeForRange,
  } from "./lib/data";
  import { applyTheme, loadConfig, type VelvetConfig } from "./lib/config";
  import { iconFor } from "./lib/icons";
  import type { Incident, RangeKey, ServiceSummary } from "./lib/types";
  import StatusHero from "./components/StatusHero.svelte";
  import ServiceRow from "./components/ServiceRow.svelte";
  import Incidents from "./components/Incidents.svelte";

  let config = $state<VelvetConfig | null>(null);
  let services = $state<ServiceSummary[]>([]);
  let incidents = $state<Incident[]>([]);
  let monitoringStart = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const RANGE_STORAGE_KEY = "velvet:range";
  function initialRange(): RangeKey {
    try {
      const stored = localStorage.getItem(RANGE_STORAGE_KEY);
      if (stored === "day" || stored === "week" || stored === "month" || stored === "year") {
        return stored;
      }
    } catch {
      // localStorage may be unavailable (private mode); use the default below.
    }
    return "year";
  }
  let range = $state<RangeKey>(initialRange());

  const today = new Date().toISOString().slice(0, 10);
  const updated = new Date().toLocaleString();

  const RANGES: { key: RangeKey; label: string }[] = [
    { key: "day", label: "24h" },
    { key: "week", label: "7d" },
    { key: "month", label: "30d" },
    { key: "year", label: "90d" },
  ];
  const RANGE_LABEL: Record<RangeKey, string> = {
    day: "24h ago",
    week: "7 days ago",
    month: "30 days ago",
    year: "90 days ago",
  };

  const overall = $derived(overallStatus(services));

  // Persist the selected range so it survives reloads.
  $effect(() => {
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, range);
    } catch {
      // ignore persistence failures (private mode / disabled storage)
    }
  });

  onMount(async () => {
    try {
      const cfg = await loadConfig();
      applyTheme(cfg);
      config = cfg;
      const [s, i, start] = await Promise.all([
        fetchSummary(cfg.owner, cfg.repo, cfg.dataBranch),
        fetchIncidents(cfg.owner, cfg.repo),
        fetchMonitoringStart(cfg.owner, cfg.repo),
      ]);
      services = s;
      incidents = i;
      monitoringStart = start;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });
</script>

<main class="page">
  {#if config}
    <nav class="nav">
      <div class="brand">
        {#if config.logoUrl}
          <img class="logo" src={config.logoUrl} alt={config.name} />
        {:else}
          {config.name}
        {/if}
      </div>
      <span class="spacer"></span>
      {#each config.navbar as link (link.href)}
        <a class:on={link.href === "/"} href={link.href}>{link.title}</a>
      {/each}
      <a
        class="subscribe"
        href="/incidents.atom"
        target="_blank"
        rel="noopener noreferrer"
        title="Subscribe to the incident feed (Atom/RSS)"
      >
        <i class="ph-duotone ph-bell-simple" aria-hidden="true"></i>
        <span>Subscribe</span>
      </a>
    </nav>
  {/if}

  {#if loading}
    <p class="state">Loading status…</p>
  {:else if error}
    <p class="state">Couldn’t load status — {error}</p>
  {:else if config}
    <StatusHero status={overall} {updated} />

    <Incidents {incidents} />

    <section class="card">
      <div class="group-head">
        <span class="gname">{config.name.toUpperCase()}</span>
        <div class="ranges">
          {#each RANGES as r (r.key)}
            <button class:on={range === r.key} onclick={() => (range = r.key)}>{r.label}</button>
          {/each}
        </div>
      </div>

      {#each services as svc (svc.slug)}
        <ServiceRow
          service={svc}
          icon={iconFor(svc.slug, config.icons)}
          days={dailyBars(svc, RANGE_DAYS[range], today, monitoringStart)}
          uptime={uptimeForRange(svc, range)}
          rangeLabel={RANGE_LABEL[range]}
        />
      {/each}
    </section>
  {/if}

  <footer class="foot">
    Powered by<br />
    <a href="https://github.com/phranck/velvet" target="_blank" rel="noopener noreferrer">Velvet</a> +
    <a href="https://upptime.js.org" target="_blank" rel="noopener noreferrer">Upptime</a>
  </footer>
</main>

<style>
  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 0 40px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--border-soft);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 600;
    font-size: 17px;
  }
  .logo {
    height: 32px;
    width: auto;
    max-width: 240px;
    display: block;
  }
  .spacer {
    flex: 1;
  }
  .nav a {
    font-size: 15px;
    color: var(--text-muted);
  }
  .nav a.on {
    color: var(--text);
    border-bottom: 2px solid var(--accent);
    padding-bottom: 2px;
  }
  .subscribe {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    padding: 5px 11px;
    border-radius: 8px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    transition:
      color 0.12s ease,
      border-color 0.12s ease,
      background 0.12s ease;
  }
  .subscribe:hover {
    color: var(--accent-bright);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .subscribe i {
    font-size: 16px;
  }
  .state {
    text-align: center;
    color: var(--text-muted);
    padding: 60px 20px;
  }
  .card {
    margin: 6px 18px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), 0 6px 16px rgba(0, 0, 0, 0.22);
  }
  .group-head {
    display: flex;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-soft);
  }
  .gname {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.6px;
    color: var(--text-muted);
  }
  .ranges {
    display: flex;
    gap: 4px;
  }
  .ranges button {
    background: none;
    border: 0;
    color: var(--text-faint);
    font: inherit;
    font-size: 13.5px;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
  }
  .ranges button.on {
    color: var(--accent-bright);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .foot {
    margin-top: auto;
    text-align: center;
    padding: 22px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-faint);
  }
  .foot a {
    color: color-mix(in srgb, var(--accent), #fff 35%);
    font-weight: 600;
  }
</style>
