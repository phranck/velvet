<script lang="ts">
  import type {
    DayStatus,
    RangeKey,
    ResponseTimesDocument,
    Service,
  } from "../lib/types";
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
  } = $props();

  const detailsId = $derived(`service-${service.id}-details`);
</script>

<div class="row">
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
  />
</div>

<style>
  .row {
    padding: 15px 18px;
    border-bottom: 1px solid var(--border-soft);
  }
  .row:last-child {
    border-bottom: 0;
  }
</style>
