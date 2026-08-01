<script lang="ts">
  import type {
    DayStatus,
    RangeKey,
    ResponseTimesDocument,
    Service,
  } from "../lib/types";
  import type { VelvetTheme } from "../lib/config";
  import ServiceDetails from "./service/ServiceDetails.svelte";
  import ServiceSummary from "./service/ServiceSummary.svelte";
  import UptimeBar from "./UptimeBar.svelte";

  let {
    service,
    days,
    uptime,
    rangeLabel,
    range,
    generatedAt,
    responseSeries,
    icon,
    open,
    onToggle,
    chart,
    transitionName,
  }: {
    service: Service;
    days: DayStatus[];
    uptime: string;
    rangeLabel: string;
    range: RangeKey;
    generatedAt: string;
    responseSeries: ResponseTimesDocument["series"];
    icon: string;
    open: boolean;
    onToggle: () => void;
    chart: VelvetTheme["chart"];
    /**
     * Names this row as its own view-transition area.
     *
     * A named element is lifted out of its ancestor's snapshot, so the browser
     * moves the row instead of stretching one image of everything around it.
     * Left unset where an ancestor already owns the transition, which is the
     * case when each service has a card to itself.
     */
    transitionName?: string;
  } = $props();

  const detailsId = $derived(`service-${service.id}-details`);
</script>

<div
  class="row"
  style={transitionName ? `view-transition-name: ${transitionName}` : undefined}
>
  <ServiceSummary
    {service}
    {icon}
    {uptime}
    {open}
    {detailsId}
    {onToggle}
  />

  <UptimeBar {days} {rangeLabel} {range} />

  <ServiceDetails
    serviceId={service.id}
    serviceName={service.name}
    checks={service.checks}
    {responseSeries}
    {range}
    {generatedAt}
    {open}
    id={detailsId}
    {chart}
  />
</div>

<style>
  .row {
    padding: var(--card-padding);
    border-bottom: 1px solid var(--border-soft);
  }
  .row:last-child {
    border-bottom: 0;
  }
</style>
