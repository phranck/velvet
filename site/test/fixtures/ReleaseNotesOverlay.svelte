<script lang="ts">
  import {
    OverlayBody,
    OverlayFooter,
    OverlayHeader,
    OverlayRoot,
  } from "../../src/components/overlay/index.js";
  import ReleaseNotes from "../../src/components/release-notes/ReleaseNotes.svelte";

  let {
    open = true,
    source = "",
  }: { open?: boolean; source?: string } = $props();
</script>

<OverlayRoot {open} label="Release notes" onclose={() => {}}>
  <OverlayHeader title="Velvet 2.0.0" onclose={() => {}}>
    What is new in this release
  </OverlayHeader>
  <OverlayBody>
    <ReleaseNotes {source} />
  </OverlayBody>
  <OverlayFooter>
    <button type="button">Install update</button>
  </OverlayFooter>
</OverlayRoot>
