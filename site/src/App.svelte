<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { adoptReaderLocale, readingLocale } from "./lib/locale.svelte";
  import {
    createVelvetDataClient,
    refreshIncidentsDocument,
    type VelvetDataClient,
  } from "./lib/data-client";
  import { applyTheme, loadConfig, type VelvetConfig } from "./lib/config";
  import type {
    IncidentsDocument,
    RangeKey,
    ResponseTimesDocument,
    StatusDocument,
  } from "./lib/types";
  import StatusPage from "./components/StatusPage.svelte";
  import type { VelvetInitialState } from "./lib/initial-state";

  /**
   * What the build already knew, rendered into the document it published.
   *
   * The page is rebuilt whenever the data changes, so the build holds
   * everything the page shows and can render it rather than leaving a blank
   * document to assemble itself. Absent where a page is served without a
   * prerender, and then this behaves as it always did and shows the loading
   * state until the first fetch lands.
   *
   * Every value here is also what the client starts from, because hydration
   * requires the first client render to match the markup it is given.
   */
  let { initial }: { initial?: VelvetInitialState } = $props();

  /**
   * The prerendered state, read once.
   *
   * It seeds the state below and is never read again: what the build rendered
   * is a starting point, and everything after it comes from the fetches in
   * onMount. Reading it untracked says that, and keeps each seed from being
   * treated as a value that should follow the prop.
   */
  const start = untrack(() => initial);

  let config = $state<VelvetConfig | null>(start?.config ?? null);
  let statusDocument = $state<StatusDocument | null>(start?.status ?? null);
  let responseTimesDocument = $state<ResponseTimesDocument | null>(
    start?.responseTimes ?? null,
  );
  let incidentsDocument = $state<IncidentsDocument | null>(
    start?.incidents ?? null,
  );
  let dataClient = $state<VelvetDataClient | null>(null);
  let loading = $state(start === undefined);
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
  // The range the document was rendered with, so the first client render agrees
  // with the markup it hydrates. The visitor's own choice is applied in onMount
  // instead, because the build cannot know it. Without a prerender this reads
  // the stored choice straight away, which is what it always did.
  let range = $state<RangeKey>(start ? start.range : (storedRange() ?? "month"));
  /** Switch the visible range and remember the explicit choice across reloads. */
  function selectRange(key: RangeKey): void {
    range = key;
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, key);
    } catch {
      // ignore persistence failures (private mode / disabled storage)
    }
  }

  /**
   * When the document being shown was generated, in the reader's own locale.
   *
   * Built once per locale rather than per render, and read through
   * `readingLocale` so the build and the browser produce the same string until
   * hydration has finished. See `lib/locale.svelte.ts`.
   */
  const UPDATED_TIME = $derived(
    new Intl.DateTimeFormat(readingLocale(), {
      dateStyle: "short",
      timeStyle: "medium",
    }),
  );

  const updated = $derived(
    statusDocument
      ? UPDATED_TIME.format(new Date(statusDocument.generatedAt))
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
    // The markup carried the build's locale, and this is the first moment the
    // reader's own may be used: the render that hydrates has to match what the
    // document says, and this runs after it.
    adoptReaderLocale();
    try {
      const cfg = await loadConfig();
      applyTheme(cfg);
      // Honour the configured default range, but only for first-time visitors —
      // an explicit earlier choice (in localStorage) always wins.
      range = storedRange() ?? cfg.defaultRange;
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
