<script lang="ts">
  import { Dialog } from "bits-ui";

  import { OFFERED_THEMES, themeById } from "../lib/themes/catalogue.js";
  import { pictureFor } from "../lib/themes/pictures.js";
  import * as Card from "./card/index.js";
  import { remember, remembered } from "./remembered.js";
  import {
    cursorFor,
    resizedTo,
    RESIZE_GRIPS,
    RESIZE_STORAGE_KEY,
    storedSize,
    type ResizeGrip,
    type ResizeSize,
  } from "./resizable.js";

  interface Props {
    /** The theme being shown, as its directory name. */
    value: string;
    /**
     * The theme this installation is published in, or none read yet.
     *
     * It decides one thing beyond the starting point: a withdrawn theme is
     * offered to nobody new, and appears here only for the installation that
     * is already running it.
     */
    published: string | null;
    onChoose: (value: string) => void;
  }

  const { value, published, onChoose }: Props = $props();

  let picking = $state(false);

  const chosen = $derived(themeById(value));

  /**
   * The themes on offer, plus the withdrawn one this installation runs.
   *
   * A withdrawn theme keeps every installation already published in it and is
   * offered to nobody else, so it is in this list exactly once: for the
   * operator who is already in it and has to be able to see which one that is.
   */
  const choices = $derived.by(() => {
    const running = published ? themeById(published) : undefined;
    if (!running || running.state === "offered") return [...OFFERED_THEMES];
    return [running, ...OFFERED_THEMES];
  });

  /** Takes a choice and closes, since choosing is the whole of this window. */
  function take(theme: string): void {
    picking = false;
    onChoose(theme);
  }

  /** The smallest it is worth showing a page at, and the largest that fits. */
  const MINIMUM = { width: 420, height: 320 };
  const WINDOW_MARGIN = 32;

  /**
   * How large the dialog is, once somebody has said.
   *
   * Null until they have, which is what lets the stylesheet decide the size it
   * opens at. Writing a size here from the start would mean stating in script
   * what the stylesheet already states, and the two would have to agree.
   *
   * A size larger than this window is kept as it was dragged rather than cut
   * down to fit: the stylesheet bounds what is drawn, so a dialog dragged wide
   * on a large screen comes back wide there after being seen on a small one.
   */
  let size = $state<ResizeSize | null>(
    remembered(RESIZE_STORAGE_KEY, (stored) => storedSize(stored, MINIMUM)),
  );

  /**
   * Drags one edge, changing the size about the centre.
   *
   * Pointer events with capture, so a drag survives the pointer leaving the
   * few pixels of the grip, and so a pen and a touch work as well as a mouse.
   *
   * @param event - The press that starts the drag.
   * @param grip - Which edge was pressed.
   */
  function startResize(event: PointerEvent, grip: ResizeGrip): void {
    const handle = event.currentTarget as HTMLElement;
    const dialog = handle.closest(".picker") as HTMLElement | null;
    if (!dialog) return;
    handle.setPointerCapture(event.pointerId);
    const box = dialog.getBoundingClientRect();
    const start = { width: box.width, height: box.height };
    const from = { x: event.clientX, y: event.clientY };
    const bounds = {
      minimumWidth: MINIMUM.width,
      minimumHeight: MINIMUM.height,
      maximumWidth: globalThis.innerWidth - WINDOW_MARGIN,
      maximumHeight: globalThis.innerHeight - WINDOW_MARGIN,
    };
    const onMove = (moved: PointerEvent): void => {
      size = resizedTo(
        grip,
        start,
        { x: moved.clientX - from.x, y: moved.clientY - from.y },
        bounds,
      );
    };
    const onUp = (): void => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      // Written when the drag settles rather than on every frame of it, so a
      // drag across the window is one write instead of several hundred.
      if (size) remember(RESIZE_STORAGE_KEY, size);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }
</script>

<!--
  A row rather than the pictures themselves. A picture of a page is far too
  large a thing to sit in a panel this narrow, and the monitor beside it
  already shows the chosen theme at full size and alive. So the sidebar says
  which theme is on, and the choosing happens where there is room for it.
-->
<button type="button" class="current" onclick={() => (picking = true)}>
  <span class="current__name">{chosen?.name ?? "Select a theme"}</span>
  <span class="current__aside">
    {#if chosen?.state === "withdrawn"}
      <span class="current__withdrawn">Withdrawn</span>
    {:else if chosen}
      {chosen.era}
    {/if}
  </span>
  <i class="current__more ph-duotone ph-caret-circle-right" aria-hidden="true"></i>
</button>

<Dialog.Root bind:open={picking}>
  <Dialog.Portal>
    <Dialog.Overlay class="picker__backdrop" />
    <Dialog.Content
      class="picker"
      style={size ? `width: ${size.width}px; height: ${size.height}px` : ""}
    >
      <!--
        Eight grips over the edges, each dragging the dialog larger and smaller
        about its centre. They carry no role and no label: resizing a window is
        a pointer affordance, and what is inside is reachable and readable at
        whatever size the dialog opens at.
      -->
      <!--
        Svelte asks for a role on anything carrying a pointer handler, and
        there is none that fits: these are not separators between two panes and
        not controls in their own right. The check is switched off here rather
        than the elements being named something they are not. Nothing is lost
        by not resizing: the dialog opens at a size every theme can be judged
        at, and everything in it is reachable and readable there.
      -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      {#each RESIZE_GRIPS as grip (grip)}
        <span
          class="picker__grip picker__grip--{grip}"
          style="cursor: {cursorFor(grip)}"
          onpointerdown={(event) => startResize(event, grip)}
        ></span>
      {/each}
      <Card.Root>
        <Card.Header>
          <Dialog.Title class="picker__title">Choose a theme</Dialog.Title>
          <Card.Addon>
            <Dialog.Close class="picker__close" aria-label="Close">
              <i class="ph-duotone ph-x-circle" aria-hidden="true"></i>
            </Dialog.Close>
          </Card.Addon>
        </Card.Header>
        <Card.Body>
          <Dialog.Description class="picker__lead">
            Every theme publishes the same status page. What changes is how it
            reads: its shape, its typefaces, and what it makes of a day.
          </Dialog.Description>

          <div class="picker__themes">
        {#each choices as theme (theme.id)}
          <button
            type="button"
            class="tile"
            class:tile--chosen={theme.id === value}
            aria-current={theme.id === value ? "true" : undefined}
            onclick={() => take(theme.id)}
          >
            <!--
              The photograph taken of this theme, the same one the start page
              and the setup show. It carries no alternative text, because the
              name is inside the same control and a description of the picture
              would be a second thing announced about one choice.
            -->
            <img class="tile__picture" src={pictureFor(theme)} alt="" />
            <span class="tile__name">{theme.name}</span>
            <span class="tile__aside">
              {#if theme.state === "withdrawn"}
                <span class="tile__withdrawn">Withdrawn</span>
              {:else}
                {theme.era}
              {/if}
            </span>
            <span class="tile__description">{theme.description}</span>
          </button>
            {/each}
          </div>
        </Card.Body>
      </Card.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .current {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--configurator-control-edge);
    border-radius: var(--configurator-radius-inner);
    background: var(--configurator-sunken);
    color: var(--configurator-text);
    font: inherit;
    font-size: var(--configurator-text-small);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--configurator-transition);
  }

  .current:hover {
    border-color: var(--configurator-accent-lit);
  }

  .current:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  .current__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current__aside {
    color: var(--configurator-text-muted);
  }

  .current__more {
    color: var(--configurator-accent);
    font-size: var(--configurator-glyph);
    line-height: 1;
  }

  /* Said in words rather than by a colour alone, because that is the one thing
     about a theme somebody has to know before they change away from it. */
  .current__withdrawn,
  .tile__withdrawn {
    color: var(--configurator-accent);
    font-family: var(--configurator-font-label);
    font-size: var(--configurator-text-label-small);
    letter-spacing: var(--configurator-tracking-label);
    text-transform: uppercase;
  }

  /* Global, because bits-ui renders these elements into a portal at the end of
     the document, so Svelte's scoping attribute never reaches them. */
  /* Dimmed rather than covered, so what the dialog is about stays visible
     behind it. */
  :global(.picker__backdrop) {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--configurator-sunken) 72%, transparent);
    z-index: 10;
  }

  /* A dialog standing in the middle of the window, sized to what it holds and
     bounded by what the window has. Two tiles across at its widest, which is
     the size a status page can be judged at without the window deciding it. */
  /* Where the dialog stands and how large it is. What it looks like is the
     card's, which fills it, so neither states the other's part. */
  :global(.picker) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(50rem, calc(100vw - 4rem));
    height: min(44rem, calc(100vh - 4rem));
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 2rem);
    border-radius: var(--configurator-radius);
    box-shadow: 0 1.5rem 4rem color-mix(in srgb, var(--configurator-sunken) 70%, transparent);
    z-index: 11;
  }

  /* Laid over the edges rather than beside them, so the dialog keeps its own
     shape and nothing inside it moves to make room. Wide enough to hit without
     hunting, which is the same figure the sidebar's own edge uses. */
  .picker__grip {
    position: absolute;
    z-index: 1;
  }

  .picker__grip--n,
  .picker__grip--s {
    left: 9px;
    right: 9px;
    height: 9px;
  }

  .picker__grip--n {
    top: -4px;
  }

  .picker__grip--s {
    bottom: -4px;
  }

  .picker__grip--e,
  .picker__grip--w {
    top: 9px;
    bottom: 9px;
    width: 9px;
  }

  .picker__grip--e {
    right: -4px;
  }

  .picker__grip--w {
    left: -4px;
  }

  .picker__grip--ne,
  .picker__grip--nw,
  .picker__grip--se,
  .picker__grip--sw {
    width: 14px;
    height: 14px;
  }

  .picker__grip--ne {
    top: -4px;
    right: -4px;
  }

  .picker__grip--nw {
    top: -4px;
    left: -4px;
  }

  .picker__grip--se {
    bottom: -4px;
    right: -4px;
  }

  .picker__grip--sw {
    bottom: -4px;
    left: -4px;
  }

  :global(.picker__title) {
    margin: 0;
    font-family: var(--configurator-font-heading);
    font-size: var(--configurator-text-heading);
    font-weight: 400;
    /* Stated, because this face's ascenders stand taller than the line box a
       normal line height gives it and the top of the word is cut off. */
    line-height: 1.4;
  }

  :global(.picker__close) {
    display: flex;
    padding: 0;
    border: none;
    background: none;
    color: var(--configurator-text-muted);
    font-size: var(--configurator-glyph-large);
    line-height: 1;
    cursor: pointer;
  }

  :global(.picker__close:hover) {
    color: var(--configurator-text);
  }

  :global(.picker__close:focus-visible) {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  :global(.picker__lead) {
    margin: 0 0 var(--configurator-inset);
    padding-inline: var(--configurator-text-inset);
    max-width: 60ch;
    color: var(--configurator-text-muted);
    font-size: var(--configurator-text-small);
    line-height: 1.5;
  }

  /* As many across as fit at a size a page can be judged at, so the same rule
     holds on a narrow window and a wide one without a breakpoint deciding it. */
  .picker__themes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--configurator-inset);
  }

  .tile {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--configurator-control-edge);
    border-radius: var(--configurator-radius-inner);
    background: var(--configurator-sunken);
    color: var(--configurator-text);
    font: inherit;
    font-size: var(--configurator-text-small);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--configurator-transition),
      background var(--configurator-transition);
  }

  .tile:hover {
    border-color: var(--configurator-accent-lit);
  }

  .tile:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  .tile--chosen {
    border-color: var(--configurator-accent);
    background: var(--configurator-accent-surface);
  }

  .tile__picture {
    grid-column: 1 / -1;
    display: block;
    width: 100%;
    aspect-ratio: 5 / 4;
    margin-bottom: 0.5rem;
    border-radius: max(calc(var(--configurator-radius-inner) - 0.5rem), 0px);
    object-fit: cover;
    object-position: top center;
    background: var(--configurator-base);
  }

  .tile__aside {
    color: var(--configurator-text-muted);
  }

  .tile__description {
    grid-column: 1 / -1;
    margin-top: 0.35rem;
    color: var(--configurator-text-muted);
    line-height: 1.5;
  }
</style>
