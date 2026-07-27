<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    barsForRange,
    overallStatus,
    RANGE_LABEL,
    uptimeForRange,
    visibleIncidentEvents,
  } from "./lib/data";
  import {
    createVelvetDataClient,
    refreshIncidentsDocument,
    type VelvetDataClient,
  } from "./lib/data-client";
  import { applyTheme, loadConfig, type VelvetConfig } from "./lib/config";
  import { injectAnalytics } from "./lib/analytics";
  import { iconFor } from "./lib/icons";
  import type {
    IncidentsDocument,
    RangeKey,
    Service,
    StatusDocument,
  } from "./lib/types";
  import StatusHero from "./components/StatusHero.svelte";
  import ServiceRow from "./components/ServiceRow.svelte";
  import Incidents from "./components/Incidents.svelte";

  let config = $state<VelvetConfig | null>(null);
  let statusDocument = $state<StatusDocument | null>(null);
  let incidentsDocument = $state<IncidentsDocument | null>(null);
  let dataClient = $state<VelvetDataClient | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const services = $derived(statusDocument?.services ?? []);
  const incidents = $derived(
    visibleIncidentEvents(incidentsDocument?.events ?? []),
  );
  const RANGE_STORAGE_KEY = "velvet:range";
  /** The visitor's previously chosen range, or null if they haven't picked one yet. */
  function storedRange(): RangeKey | null {
    try {
      const stored = localStorage.getItem(RANGE_STORAGE_KEY);
      if (
        stored === "day" ||
        stored === "week" ||
        stored === "month" ||
        stored === "quarter" ||
        stored === "year"
      ) {
        return stored;
      }
    } catch {
      // localStorage may be unavailable (private mode); fall through to null.
    }
    return null;
  }
  // Until the config loads, sit on the 30d view; onMount swaps in the configured
  // default range if the visitor hasn't picked one of their own.
  let range = $state<RangeKey>(storedRange() ?? "month");
  /** Switch the visible range and remember the explicit choice across reloads. */
  function selectRange(key: RangeKey): void {
    range = key;
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, key);
    } catch {
      // ignore persistence failures (private mode / disabled storage)
    }
  }

  const updated = $derived(
    statusDocument
      ? new Date(statusDocument.generatedAt).toLocaleString(navigator.language)
      : "",
  );

  const RANGES: { key: RangeKey; label: string }[] = [
    { key: "day", label: "24h" },
    { key: "week", label: "7d" },
    { key: "month", label: "30d" },
    { key: "quarter", label: "90d" },
    { key: "year", label: "1yr" },
  ];
  const overall = $derived(overallStatus(services));

  // Per-service expand/collapse state, lifted here so the "expand/collapse all"
  // control can drive every card at once. Each card still toggles on its own;
  // the state is persisted per service ID across reloads.
  let openMap = $state<Record<string, boolean>>({});
  const openKey = (serviceId: string): string => `velvet:open:${serviceId}`;
  function persistOpen(serviceId: string, isOpen: boolean): void {
    try {
      localStorage.setItem(openKey(serviceId), isOpen ? "1" : "0");
    } catch {
      // ignore persistence failures (private mode / disabled storage)
    }
  }
  // Expand/collapse motion. FLIP keeps it on the GPU: animating the panel's height
  // (or grid-template-rows) relayouts the whole page every frame and drops frames;
  // instead the height snaps instantly and we tween the resulting position shift with
  // transform/opacity, which the compositor handles without touching layout.
  const FLIP_MS = 260;
  const FLIP_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
  const prefersReducedMotion = (): boolean =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Apply an open-state change and animate the resulting layout shift on the GPU.
   *
   * FLIP (First, Last, Invert, Play): snapshot each list item's top, let the DOM
   * settle (the card height snaps instantly), then tween every moved item from its
   * old position to its new one via `transform: translateY`, and fade in any panel
   * that just opened so the transient overlap during the slide is masked. Honours
   * `prefers-reduced-motion` by applying the change without animating.
   *
   * @param apply - mutates `openMap` (and persists); runs between the two snapshots.
   */
  async function flipToggle(apply: () => void): Promise<void> {
    const selector = config?.layout === "cards" ? ".card" : ".row";
    const items = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (prefersReducedMotion() || items.length === 0) {
      apply();
      return;
    }
    // Settle any in-flight FLIP so getBoundingClientRect reads true (untransformed) tops.
    for (const el of items) {
      for (const anim of el.getAnimations()) anim.finish();
    }
    const firstTop = items.map((el) => el.getBoundingClientRect().top);
    const wasOpen = items.map(
      (el) => el.querySelector(".detail-wrap")?.classList.contains("open") === true,
    );

    apply();
    await tick();

    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const dy = firstTop[i] - el.getBoundingClientRect().top;
      if (dy !== 0) {
        el.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
          { duration: FLIP_MS, easing: FLIP_EASE },
        );
      }
      const nowOpen = el.querySelector(".detail-wrap")?.classList.contains("open") === true;
      if (nowOpen && !wasOpen[i]) {
        el.querySelector<HTMLElement>(".detail")?.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: FLIP_MS - 60, easing: FLIP_EASE, fill: "backwards" },
        );
      }
    }
  }

  /** Toggle a single card and persist its new state. */
  function toggleOne(serviceId: string): void {
    flipToggle(() => {
      const next = !openMap[serviceId];
      openMap = { ...openMap, [serviceId]: next };
      persistOpen(serviceId, next);
    });
  }
  /** Expand (or collapse) every service card at once. */
  function setAllOpen(isOpen: boolean): void {
    flipToggle(() => {
      const next: Record<string, boolean> = { ...openMap };
      for (const svc of services) {
        next[svc.id] = isOpen;
        persistOpen(svc.id, isOpen);
      }
      openMap = next;
    });
  }
  /** True only when every card is expanded — drives the toggle-all icon + action. */
  const allOpen = $derived(services.length > 0 && services.every((s) => openMap[s.id] === true));

  onMount(async () => {
    try {
      const cfg = await loadConfig();
      applyTheme(cfg);
      injectAnalytics(cfg);
      // Honour the configured default range, but only for first-time visitors —
      // an explicit earlier choice (in localStorage) always wins.
      if (storedRange() === null) {
        range = cfg.defaultRange;
      }
      document.title = `${cfg.name} — Status`;
      config = cfg;
      const client = createVelvetDataClient(cfg.dataBaseUrl);
      const snapshot = await client.loadSnapshot();
      dataClient = client;
      statusDocument = snapshot.status;
      incidentsDocument = snapshot.incidents;
      // Seed each card's open state from its persisted per-service value.
      const seeded: Record<string, boolean> = {};
      for (const svc of snapshot.status.services) {
        try {
          seeded[svc.id] = localStorage.getItem(openKey(svc.id)) === "1";
        } catch {
          seeded[svc.id] = false;
        }
      }
      openMap = seeded;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  /** How often the incident document refreshes while the tab is visible. */
  const INCIDENT_REFRESH_MS = 60_000;

  /**
   * Refresh incident and maintenance events in place. Keeps the last valid
   * document when the current response is unavailable or invalid.
   */
  async function refreshIncidents(): Promise<void> {
    if (!dataClient || !incidentsDocument) return;
    const current = incidentsDocument;
    incidentsDocument = await refreshIncidentsDocument(
      dataClient,
      () => incidentsDocument ?? current,
    );
  }

  // Live banner refresh pauses while the tab is hidden and resumes immediately when
  // it becomes visible. The interval starts after the first valid snapshot.
  $effect(() => {
    if (!dataClient || !incidentsDocument) return;
    const refreshIfVisible = (): void => {
      if (!document.hidden) void refreshIncidents();
    };
    const timer = setInterval(refreshIfVisible, INCIDENT_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  });
</script>

<main class="page">
  {#if config}
    <nav class="nav">
      <a class="brand" href="/" aria-label={config.name}>
        {#if config.logoUrl}
          <img class="logo" src={config.logoUrl} alt={config.name} />
        {:else}
          {config.name}
        {/if}
      </a>
      {#each config.navbar as link (link.href)}
        <a class="navlink" class:on={link.href === "/"} href={link.href}>{link.title}</a>
      {/each}
    </nav>
  {/if}

  {#if loading}
    <p class="state">Loading status…</p>
  {:else if error}
    <p class="state">Couldn’t load status — {error}</p>
  {:else if config}
    <StatusHero status={overall} {updated} />

    <Incidents {incidents} />

    {#snippet rangeButtons()}
      <div class="ranges">
        {#each RANGES as r (r.key)}
          <button class:on={range === r.key} onclick={() => selectRange(r.key)}>{r.label}</button>
        {/each}
      </div>
    {/snippet}

    {#snippet toggleAllBtn()}
      <button
        class="toggle-all"
        onclick={() => setAllOpen(!allOpen)}
        title={allOpen ? "Collapse all" : "Expand all"}
        aria-label={allOpen ? "Collapse all" : "Expand all"}
      >
        <i
          class="ph-duotone {allOpen ? 'ph-arrows-in-line-vertical' : 'ph-arrows-out-line-vertical'}"
          aria-hidden="true"
        ></i>
      </button>
    {/snippet}

    {#snippet serviceRow(svc: Service, cfg: VelvetConfig)}
      <ServiceRow
        service={svc}
        icon={iconFor(svc.id, cfg.icons)}
        days={barsForRange(
          svc,
          range,
          statusDocument!.generatedAt,
          statusDocument!.monitoringStartedAt,
        )}
        uptime={uptimeForRange(
          svc,
          range,
          statusDocument!.generatedAt,
          statusDocument!.monitoringStartedAt,
        )}
        rangeLabel={RANGE_LABEL[range]}
        {range}
        open={openMap[svc.id] === true}
        onToggle={() => toggleOne(svc.id)}
      />
    {/snippet}

    {#if config.layout === "cards"}
      <div class="range-bar">
        <span class="gname">{config.name.toUpperCase()}</span>
        {@render rangeButtons()}
        {@render toggleAllBtn()}
      </div>
      {#each services as svc (svc.id)}
        <section class="card">
          {@render serviceRow(svc, config)}
        </section>
      {/each}
    {:else}
      <section class="card">
        <div class="group-head">
          <span class="gname">{config.name.toUpperCase()}</span>
          {@render rangeButtons()}
          {@render toggleAllBtn()}
        </div>
        {#each services as svc (svc.id)}
          {@render serviceRow(svc, config)}
        {/each}
      </section>
    {/if}
  {/if}

  {#if config && (config.showPoweredBy || config.showSubscribe)}
    <footer class="foot" class:single={!(config.showPoweredBy && config.showSubscribe)}>
      {#if config.showPoweredBy}
        <span class="powered">
          Powered by
          <a href="https://github.com/phranck/velvet" target="_blank" rel="noopener noreferrer"
            >Velvet</a
          >
        </span>
      {/if}
      {#if config.showSubscribe}
        <a
          class="sub-link"
          href="/incidents.atom"
          target="_blank"
          rel="noopener noreferrer"
          title="Subscribe to the incident feed (Atom/RSS)"
        >
          <i class="ph-duotone ph-rss" aria-hidden="true"></i>
          <span>Subscribe</span>
        </a>
      {/if}
    </footer>
  {/if}
</main>

<style>
  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
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
    font-weight: 600;
    font-size: 17px;
    color: var(--text);
  }
  .logo {
    height: var(--logo-height);
    width: auto;
    max-width: 100%;
    display: block;
  }
  .navlink {
    font-size: 15px;
    color: var(--text-muted);
  }
  .navlink.on {
    color: var(--text);
    border-bottom: 2px solid var(--accent);
    padding-bottom: 2px;
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
  /* Range selector header shown above the per-service cards in "cards" layout. */
  .range-bar {
    display: flex;
    align-items: center;
    margin: 6px 32px 2px;
  }
  .gname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  /* Expand/collapse-all control, sitting just right of the range selector. */
  .toggle-all {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
    padding: 3px 6px;
    background: none;
    border: 0;
    border-radius: 6px;
    color: var(--text-faint);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    transition:
      color 0.12s ease,
      background 0.12s ease;
  }
  .toggle-all:hover {
    color: var(--accent-bright);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 32px;
    font-size: 14px;
    color: var(--text-faint);
  }
  .foot.single {
    justify-content: center;
  }
  .powered a {
    color: color-mix(in srgb, var(--accent), #fff 35%);
    font-weight: 600;
  }
  .sub-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-weight: 500;
    white-space: nowrap;
    transition: color 0.12s ease;
  }
  .sub-link:hover {
    color: var(--accent-bright);
  }
  .sub-link i {
    font-size: 16px;
  }
</style>
