<script lang="ts">
  import {
    MONITOR_READY,
    MONITOR_PAGE,
    MONITOR_SETTINGS,
  } from "../lib/themes/monitor-messages.js";

  interface Props {
    /** The theme being shown, as its directory name. */
    theme: string;
    /** What the operator has set, as custom properties on the root. */
    declarations?: Record<string, string>;
    /**
     * The page's own settings that are data rather than appearance.
     *
     * Sent separately because the page is drawn again to take them, where a
     * custom property is simply written onto what is already there.
     */
    site?: Record<string, string>;
    /** The element the theme's page is rooted at, as its manifest states it. */
    themeRoot?: string;
    /**
     * The properties worth reading back once the page has drawn.
     *
     * A theme states many of these itself, and a palette moves them, so what a
     * control should start at is what the page shows rather than what the
     * manifest calls the default.
     */
    watching?: readonly string[];
    /** Called with what those properties resolve to on the theme's own root. */
    onResolved?: (values: Record<string, string>) => void;
  }

  const {
    theme,
    declarations = {},
    site = {},
    themeRoot = "",
    watching = [],
    onResolved,
  }: Props = $props();

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
      if ((event.data as { type?: string })?.type !== MONITOR_READY) return;
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
      { type: MONITOR_SETTINGS, declarations: settings },
      globalThis.location.origin,
    );
    read();
  });

  // Its own effect, so writing a property does not redraw the page and a
  // redraw does not depend on a property having changed.
  $effect(() => {
    const target = frame?.contentWindow;
    const fields = site;
    if (!target || readyAt !== source) return;
    target.postMessage(
      { type: MONITOR_PAGE, site: fields },
      globalThis.location.origin,
    );
  });

  /**
   * Reads back what the page resolves for the properties worth watching.
   *
   * After the settings have been sent rather than before, so what is read is
   * the page as it now stands. Read directly rather than asked for: the frame
   * is same-origin, and a message back would be a second thing to keep in step
   * with what was just sent.
   *
   * The read is deferred by two frames rather than one. A property written
   * this instant has not been through style resolution, and one frame proved
   * too early: switching a palette read back the colours of the one before it.
   */
  function read(): void {
    if (!onResolved || watching.length === 0 || themeRoot === "") return;
    const document_ = frame?.contentDocument;
    const page = document_?.querySelector(themeRoot);
    if (!page) return;
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
      const style = globalThis.getComputedStyle(page);
      onResolved(
        Object.fromEntries(
          watching.map((property) => [
            property,
            style.getPropertyValue(property).trim(),
          ]),
        ),
      );
      });
    });
  }
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
