<script lang="ts">
  import { onMount } from "svelte";
  import {
    createVelvetDataClient,
    refreshIncidentsDocument,
    type VelvetDataClient,
  } from "./lib/data-client";
  import { applyTheme, loadConfig, type VelvetConfig } from "./lib/config";
  import { injectAnalytics } from "./lib/analytics";
  import type {
    IncidentsDocument,
    RangeKey,
    ResponseTimesDocument,
    StatusDocument,
  } from "./lib/types";
  import StatusPage from "./components/StatusPage.svelte";

  let config = $state<VelvetConfig | null>(null);
  let statusDocument = $state<StatusDocument | null>(null);
  let responseTimesDocument = $state<ResponseTimesDocument | null>(null);
  let incidentsDocument = $state<IncidentsDocument | null>(null);
  let dataClient = $state<VelvetDataClient | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const services = $derived(statusDocument?.services ?? []);
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
  /** Toggle a single card and persist its new state. */
  function toggleOne(serviceId: string): void {
    const next = !openMap[serviceId];
    openMap = { ...openMap, [serviceId]: next };
    persistOpen(serviceId, next);
  }
  /** Expand (or collapse) every service card at once. */
  function setAllOpen(isOpen: boolean): void {
    const next: Record<string, boolean> = { ...openMap };
    for (const svc of services) {
      next[svc.id] = isOpen;
      persistOpen(svc.id, isOpen);
    }
    openMap = next;
  }
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
      responseTimesDocument = snapshot.responseTimes;
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

{#if loading}
  <main class="state-shell">
    <p>Loading status…</p>
  </main>
{:else if error}
  <main class="state-shell">
    <p>Couldn’t load status — {error}</p>
  </main>
{:else if config && statusDocument && responseTimesDocument && incidentsDocument}
  <StatusPage
    {config}
    {statusDocument}
    {responseTimesDocument}
    {incidentsDocument}
    {range}
    {openMap}
    {updated}
    onSelectRange={selectRange}
    onToggleAll={setAllOpen}
    onToggleService={toggleOne}
  />
{/if}

<style>
  .state-shell {
    max-width: 760px;
    min-height: 100vh;
    display: grid;
    place-items: center;
    margin: 0 auto;
    padding: 60px 20px;
    color: var(--text-muted);
    text-align: center;
  }
</style>
