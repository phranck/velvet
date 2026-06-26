<script lang="ts">
  import type { Incident } from "../lib/types";

  let { incidents }: { incidents: Incident[] } = $props();

  const maintenance = $derived(incidents.filter((i) => i.isMaintenance));
  const active = $derived(incidents.filter((i) => !i.isMaintenance));
</script>

{#if maintenance.length}
  <section class="block">
    {#each maintenance as m (m.number)}
      <a class="card maint" href={m.url}>
        <i class="ph-duotone ph-wrench" aria-hidden="true"></i>
        <span class="title">{m.title}</span>
        <span class="meta mono">#{m.number}</span>
      </a>
    {/each}
  </section>
{/if}

{#if active.length}
  <section class="block">
    <h2>Active incidents</h2>
    {#each active as i (i.number)}
      <a class="card inc" href={i.url}>
        <span class="title">{i.title}</span>
        <span class="meta mono">Opened {new Date(i.createdAt).toLocaleString()} · #{i.number}</span>
      </a>
    {/each}
  </section>
{/if}

<style>
  .block {
    margin: 0 18px 8px;
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
    border: 1px solid;
  }
  .inc {
    background: #1a0e11;
    border-color: #43202a;
  }
  .maint {
    display: flex;
    align-items: center;
    gap: 10px;
    background: color-mix(in srgb, var(--accent) 12%, #0c0d12);
    border-color: color-mix(in srgb, var(--accent) 35%, #15172a);
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
    flex: 1;
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
