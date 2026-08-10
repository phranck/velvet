<script lang="ts">
  import { bundlePreviewDocument } from "../lib/bundles/preview.js";

  /**
   * A design shown in a document of its own.
   *
   * The frame is not decoration. A preview puts a design beside the surface
   * that is previewing it, and a design that declared anything reaching past
   * its own root would then be styling the tool. Rendering it in its own
   * document makes "one document carries one design" true by construction.
   *
   * Nothing inside it runs: the sandbox withholds scripts, because choosing how
   * a page should look is not using the page.
   */
  interface Props {
    /** The design's name, which is also the frame's accessible name. */
    title: string;
    /** The markup the design's template produced. */
    markup: string;
    /** The design's whole stylesheet, as text. */
    css: string;
  }

  let { title, markup, css }: Props = $props();

  const document = $derived(bundlePreviewDocument({ title, markup, css }));
</script>

<iframe class="design-preview" {title} srcdoc={document} sandbox="allow-same-origin"
></iframe>

<style>
  .design-preview {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 480px;
    border: 0;
    background: transparent;
  }
</style>
