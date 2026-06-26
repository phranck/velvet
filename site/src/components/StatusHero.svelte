<script lang="ts">
  import type { ServiceStatus } from "../lib/types";

  let { status, updated }: { status: ServiceStatus; updated: string } = $props();

  const config = {
    up: { icon: "ph-check-circle", text: "All systems operational", color: "var(--accent-bright)" },
    degraded: { icon: "ph-warning", text: "Some systems degraded", color: "var(--accent-deg)" },
    down: { icon: "ph-x-circle", text: "Major service outage", color: "var(--accent-down)" },
  } as const;

  const c = $derived(config[status]);
</script>

<div class="hero">
  <span class="ico" style:color={c.color}>
    <i class="ph-duotone {c.icon}" aria-hidden="true"></i>
  </span>
  <h1>{c.text}</h1>
  <p class="updated mono">Last updated {updated}</p>
</div>

<style>
  .hero {
    text-align: center;
    padding: 40px 20px 30px;
  }
  .ico {
    font-size: 54px;
    line-height: 1;
    display: inline-block;
    margin-bottom: 14px;
    filter: drop-shadow(0 0 14px color-mix(in srgb, currentColor 35%, transparent));
  }
  h1 {
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.8px;
    line-height: 1.1;
    margin: 0 0 8px;
    background: linear-gradient(180deg, #ffffff 0%, #c3c9d4 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .updated {
    font-size: 15px;
    color: var(--text-muted);
    margin: 0;
  }
</style>
