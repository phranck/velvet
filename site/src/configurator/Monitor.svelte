<script lang="ts">
  interface Props {
    /** The theme being shown, as its directory name. */
    theme: string;
    /** What the operator has set, as custom properties on the root. */
    declarations?: Record<string, string>;
  }

  const { theme, declarations = {} }: Props = $props();

  let frame = $state<HTMLIFrameElement | null>(null);

  /**
   * The address of the theme being shown.
   *
   * One theme per address, and the frame loads only the one it is pointed at.
   * Every theme carries its own faces, so binding them all into one document
   * is what made the previous configurator 1.9 MB.
   */
  const source = $derived(`/config/themes/${theme}/preview.html`);

  /**
   * The address whose document has said it is ready for settings.
   *
   * An address rather than a flag, because readiness belongs to the document
   * and not to the frame: one just pointed at another theme has not run its
   * script yet, and settings sent before it does reach nothing. Holding the
   * address is also what makes a late message from the document being replaced
   * fall to the comparison below rather than mark its successor ready.
   */
  let readyAt = $state<string | null>(null);

  $effect(() => {
    const listener = (event: MessageEvent): void => {
      if (event.origin !== globalThis.location.origin) return;
      if ((event.data as { type?: string })?.type !== "velvet:ready") return;
      readyAt = frame?.getAttribute("src") ?? null;
    };
    globalThis.addEventListener("message", listener);
    return () => globalThis.removeEventListener("message", listener);
  });

  $effect(() => {
    const target = frame?.contentWindow;
    const settings = declarations;
    if (!target || readyAt !== source) return;
    target.postMessage(
      { type: "velvet:settings", declarations: settings },
      globalThis.location.origin,
    );
  });
</script>

<div class="monitor">
  <!--
    A frame with an address of its own rather than one written as srcdoc. The
    service answers with style-src 'self' and script-src 'self', and a srcdoc
    document inherits its embedder's policy, so an inlined stylesheet would be
    refused. It would also have no address for the theme's relative font
    references to resolve against.

    No sandbox. Every theme comes from this repository, there are no foreign
    ones, and the frame separates styles rather than trust.
  -->
  <iframe
    bind:this={frame}
    class="monitor__frame"
    src={source}
    title="Preview of the {theme} theme"
  ></iframe>
</div>

<style>
  .monitor {
    flex: 1;
    min-width: 0;
    padding: var(--configurator-inset);
  }

  .monitor__frame {
    display: block;
    width: 100%;
    height: 100%;
    border: 1px solid var(--configurator-divider);
    /* A surface standing on the page rather than one nested in another, so it
       carries the stated radius. */
    border-radius: var(--configurator-radius);
    background: var(--configurator-sunken);
  }
</style>
