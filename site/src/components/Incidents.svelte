<script lang="ts">
  import type { IncidentEvent } from "../lib/types";

  let { incidents }: { incidents: IncidentEvent[] } = $props();

  const maintenance = $derived(incidents.filter((event) => event.kind === "maintenance"));
  const active = $derived(incidents.filter((event) => event.kind === "incident"));
</script>

{#if maintenance.length}
  <section class="block">
    {#each maintenance as m (m.id)}
      <div class="card maint">
        <i class="ph-duotone ph-wrench" aria-hidden="true"></i>
        <span class="event-copy">
          <span class="title">{m.title}</span>
          {#if m.summary}<span class="summary">{m.summary}</span>{/if}
        </span>
        <span class="meta mono">{m.state} · {new Date(m.startsAt).toLocaleString()}</span>
      </div>
    {/each}
  </section>
{/if}

{#if active.length}
  <section class="block">
    <h2>Active incidents</h2>
    {#each active as i (i.id)}
      <div class="card inc">
        <span class="title">{i.title}</span>
        {#if i.summary}<span class="summary">{i.summary}</span>{/if}
        <span class="meta mono">Started {new Date(i.startsAt).toLocaleString()}</span>
      </div>
    {/each}
  </section>
{/if}

<style>
  .block {
    /* The inset the status page gives everything inside it, so this stands
       exactly as wide as the cards beneath it. */
    margin: 0 var(--status-content-inset) 8px;
  }
  h2 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 14px 2px 10px;
  }
  .card {
    display: block;
    border-radius: 12px;
    padding: 13px 15px;
    margin-bottom: 9px;
    border: var(--card-border-width) solid;
  }
  .inc {
    background: color-mix(in srgb, var(--grid-outage) 12%, var(--card-background));
    border-color: color-mix(in srgb, var(--grid-outage) 38%, var(--card-border));
  }
  .maint {
    display: flex;
    align-items: center;
    gap: 10px;
    background: color-mix(in srgb, var(--accent) 12%, var(--card-background));
    border-color: color-mix(in srgb, var(--accent) 35%, var(--card-border));
  }
  .maint i {
    color: var(--accent-bright);
    font-size: 20px;
  }
  .title {
    display: block;
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
  }
  .maint .title {
    display: block;
  }
  .event-copy {
    flex: 1;
  }
  .summary {
    display: block;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 14px;
  }
  .meta {
    display: block;
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .maint .meta {
    margin-top: 0;
  }
</style>
