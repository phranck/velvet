<script lang="ts">
  import { RadioGroup, Slider, Switch } from "bits-ui";

  import type { ThemeFeature } from "../lib/themes/manifest.js";
  import type { ThemeSettings } from "../lib/themes/settings.js";
  import { shuffledPlaces, sliderStep } from "./controls.js";

  interface Props {
    /** What the chosen theme lets an operator set, in its own order. */
    features: readonly ThemeFeature[];
    /** What is set right now, which is where each control starts. */
    settings: ThemeSettings;
    /**
     * What the page resolves for each property, keyed by the property.
     *
     * Where nobody has set a feature, this is what its control shows: a theme
     * states many of these itself and a palette moves them, so the manifest's
     * default describes the page only whilst nothing else has spoken.
     */
    showing?: Record<string, string>;
    /** Called with one feature's new value. */
    onChange: (key: string, value: string | number | boolean) => void;
  }

  const { features, settings, showing = {}, onChange }: Props = $props();

  /**
   * Whether a feature means anything right now.
   *
   * A theme names the switch a setting depends on, and a setting whose switch
   * is off changes nothing. It stays where it is and stops answering, rather
   * than disappearing: a control that comes and goes makes the panel jump, and
   * what it does is easier to understand whilst it is still visible.
   *
   * @param feature - The feature being drawn.
   * @returns Whether its control takes part.
   */
  function enabled(feature: ThemeFeature): boolean {
    if (!feature.enabledBy) return true;
    const switched = features.find(
      (candidate) => candidate.key === feature.enabledBy,
    );
    if (!switched || switched.type !== "switch") return true;
    const given = settings[switched.key];
    return typeof given === "boolean" ? given : switched.default;
  }

  /**
   * The features in the order the theme states them, under what they belong to.
   *
   * The grouping is the theme's own, because only a theme knows what its
   * settings have to do with each other. A group appears where its first
   * feature does, so the theme decides the order of the groups as well by
   * deciding the order of the features.
   */
  const grouped = $derived.by(() => {
    const groups: { name: string | null; features: ThemeFeature[] }[] = [];
    for (const feature of features) {
      const name = feature.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.features.push(feature);
      else groups.push({ name, features: [feature] });
    }
    return groups;
  });

  /**
   * What one feature stands at, which is what it was set to or its default.
   *
   * The type is checked rather than assumed. A stored value comes from a
   * configuration somebody may have edited by hand, and a number where a
   * colour belongs would otherwise reach a control that cannot show it.
   *
   * @param feature - The feature being drawn.
   * @returns Its current value, of the type the feature is.
   */
  function valueOf(feature: ThemeFeature): string | number | boolean {
    const given = settings[feature.key] ?? livingValue(feature);
    if (feature.type === "switch") {
      return typeof given === "boolean" ? given : feature.default;
    }
    if (feature.type === "number") {
      return typeof given === "number" ? given : feature.default;
    }
    if (feature.type === "choice") {
      return typeof given === "string" &&
        feature.choices.some((choice) => choice.value === given)
        ? given
        : feature.default;
    }
    return typeof given === "string" ? given : feature.default;
  }

  /**
   * What the page is showing for a feature nobody has set.
   *
   * Only for a colour, and only for one the theme states itself. Everything
   * else is written by the build whether it was set or not, so the page shows
   * the default already, and a length or a keyword read back from a computed
   * style comes back in a form a control cannot take.
   *
   * @param feature - The feature being drawn.
   * @returns What to show, or undefined to fall back to the default.
   */
  function livingValue(feature: ThemeFeature): string | undefined {
    if (feature.type !== "colour" || !feature.declared) return undefined;
    const value = showing[feature.property];
    return value !== undefined && /^#[0-9a-fA-F]{6}$/u.test(value)
      ? value
      : undefined;
  }

</script>

{#if features.length === 0}
  <p class="placeholder">This theme takes no settings.</p>
{:else}
  {#each grouped as group (group.name ?? group.features[0]!.key)}
    <section class="group" aria-label={group.name ?? undefined}>
      {#if group.name}
        <h3 class="group__name">{group.name}</h3>
      {/if}
      <div class="settings">
        {#each group.features as feature (feature.key)}
      <!--
        The label is the control's own name rather than a heading beside it,
        which is what makes clicking the words work and what a screen reader
        reads out when the control takes focus.
      -->
      <div
        class="field"
        class:field--inline={feature.type === "switch"}
        class:field--narrow={feature.type === "colour" ||
          feature.type === "arrangement"}
        class:field--wide={feature.type === "number"}
        class:field--off={!enabled(feature)}
      >
        {#if feature.type === "switch"}
          <label class="field__label" for="feature-{feature.key}">
            {feature.label}
          </label>
          <Switch.Root
            id="feature-{feature.key}"
            class="switch"
            checked={valueOf(feature) === true}
            onCheckedChange={(checked) => onChange(feature.key, checked)}
          >
            <Switch.Thumb class="switch__thumb" />
          </Switch.Root>
        {:else if feature.type === "colour"}
          <label class="field__label" for="feature-{feature.key}">
            {feature.label}
          </label>
          <!--
            The browser's own colour control. bits-ui draws none, and a picker
            written here would be a second answer to a thing every platform
            already answers, including for somebody who picks colours by name
            or by eyedropper.
          -->
          <span class="colour">
            <input
              id="feature-{feature.key}"
              type="color"
              class="colour__well"
              value={String(valueOf(feature))}
              oninput={(event) =>
                onChange(feature.key, event.currentTarget.value)}
            />
            <span class="colour__value">{valueOf(feature)}</span>
          </span>
        {:else if feature.type === "arrangement"}
          <span class="field__label">{feature.label}</span>
          <!--
            A button rather than a control per place. Nobody arranges six
            clouds one at a time, and twelve sliders for one scattering is
            twelve things to read where there is one decision.
          -->
          <button
            type="button"
            class="shuffle"
            disabled={!enabled(feature)}
            onclick={() =>
              onChange(feature.key, shuffledPlaces(feature.properties.length))}
          >
            <i class="ph-duotone ph-shuffle" aria-hidden="true"></i>
            Shuffle
          </button>
        {:else if feature.type === "choice"}
          <span class="field__label" id="feature-{feature.key}">
            {feature.label}
          </span>
          <!--
            One track with the choices along it rather than a stack of rows.
            Three named values are a small thing to decide, and a row each
            spends the height of a whole section on it. The behaviour is the
            radio group's still: arrow keys move between them and only the
            chosen one takes focus from the tab order.
          -->
          <RadioGroup.Root
            class="segmented"
            value={String(valueOf(feature))}
            onValueChange={(value) => onChange(feature.key, value)}
            aria-labelledby="feature-{feature.key}"
          >
            {#each feature.choices as choice (choice.value)}
              <RadioGroup.Item class="segmented__item" value={choice.value}>
                {choice.label}
              </RadioGroup.Item>
            {/each}
          </RadioGroup.Root>
        {:else}
          <label class="field__label" for="feature-{feature.key}">
            {feature.label}
            <!--
              The reading belongs to the label rather than standing beside it
              as a second thing to announce, because `aria-label` on the
              control would replace what the control says rather than add to
              it.
            -->
            <span class="field__reading">
              {valueOf(feature)}{feature.unit}
            </span>
          </label>
          <Slider.Root
            id="feature-{feature.key}"
            type="single"
            class="slider"
            disabled={!enabled(feature)}
            value={Number(valueOf(feature))}
            min={feature.minimum}
            max={feature.maximum}
            step={sliderStep(feature.minimum, feature.maximum)}
            onValueChange={(value) => onChange(feature.key, value)}
          >
            {#snippet children({ tickItems })}
              <span class="slider__track">
                <Slider.Range class="slider__range" />
                <!--
                  One mark per step, so a range of six reads as six choices
                  rather than as a distance. Drawn only where the steps are few
                  enough to tell apart: a mark every pixel is a line.
                -->
                {#if tickItems.length <= 12}
                  {#each tickItems as tick (tick.index)}
                    <Slider.Tick index={tick.index} class="slider__tick" />
                  {/each}
                {/if}
              </span>
              <Slider.Thumb index={0} class="slider__thumb" />
            {/snippet}
          </Slider.Root>
        {/if}
          </div>
        {/each}
      </div>
    </section>
  {/each}
{/if}

<style>
  /* Two columns, and each setting takes what its control needs rather than a
     row of its own. A colour is a swatch under its name, so three of
     them fit across and a set like the three states of a day stands as a
     set. Anything
     wider takes the whole row, which is what a list of choices or a slider
     needs to be read across. */
  /* One group under the next, parted by a hairline that runs the full width of
     the section rather than stopping at the padding its content is held in.
     A rule that stopped short would read as an underline belonging to the
     group above it. */
  .group + .group {
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    /* The colour the section itself is bounded in, because this parts what is
       inside one section rather than bounding a control. */
    border-top: 1px solid var(--configurator-divider);
    margin-inline: calc(-1 * var(--configurator-inset));
    padding-inline: var(--configurator-inset);
  }

  .group__name {
    margin: 0 0 0.5rem;
    color: var(--configurator-text);
    font-family: var(--configurator-font-label);
    font-size: var(--configurator-text-label-small);
    font-weight: 400;
    letter-spacing: var(--configurator-tracking-label);
    text-transform: uppercase;
  }

  .settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.9rem 0.75rem;
    align-items: stretch;
  }

  .field {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.35rem;
    grid-column: 1 / -1;
  }

  /* The control sits in the middle of what is left under the label, so two
     controls sharing a row are centred on each other however tall each one is
     and however many lines their names take. */
  .field > :global(:last-child) {
    align-self: center;
  }

  .field--narrow {
    grid-column: span 1;
  }

  /* Two thirds, so a slider keeps a length worth dragging whilst what belongs
     beside it stands in the last third rather than on a row of its own. */
  .field--wide {
    grid-column: span 2;
  }

  /* Still there, and plainly not answering. A control that vanished would make
     the panel jump and leave nothing to explain why. */
  .field--off {
    opacity: 0.45;
  }

  /* A switch stands beside what it is called rather than under it: there is
     nothing to read across, and a row of its own for two words wastes the
     height every other setting needs. */
  .field--inline {
    grid-template-columns: 1fr auto;
    align-items: center;
  }

  .field__label {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--configurator-text-muted);
    font-size: var(--configurator-text-small);
    line-height: 1.3;
    /* Wraps rather than pushing its column wider, so three columns stay three
       columns whatever a theme calls its settings. */
    overflow-wrap: anywhere;
  }

  /* A colour stands as a column of three: what it is called, the swatch, and
     what it is set to. Centred on each other, because a swatch is narrower
     than either line beside it and reads as adrift against a left edge. */
  .field--narrow .field__label {
    justify-content: center;
    text-align: center;
  }

  .field__reading {
    color: var(--configurator-text);
    font-variant-numeric: tabular-nums;
  }

  /* The swatch under its name and the reading under the swatch, because three
     of these stand side by side and a row each would make every one of them as
     wide as its longest reading. */
  .colour {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }

  /* The well is the swatch. A colour input draws its own frame and padding,
     which is what the inset rule below removes so the colour reaches the
     edge of what looks like a swatch. */
  .colour__well {
    width: 2.25rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid var(--configurator-control-edge);
    border-radius: var(--configurator-radius-inner);
    background: none;
    cursor: pointer;
  }

  .colour__well::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .colour__well::-webkit-color-swatch {
    border: none;
    border-radius: calc(var(--configurator-radius-inner) - 2px);
  }

  .colour__well:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  .colour__value {
    color: var(--configurator-text);
    font-size: var(--configurator-text-small);
    font-variant-numeric: tabular-nums;
  }

  .placeholder {
    margin: 0;
    color: var(--configurator-text-muted);
    font-size: var(--configurator-text-small);
    line-height: 1.5;
  }

  /* Global, because bits-ui renders these elements rather than this template,
     so Svelte's scoping attribute never reaches them. */
  /* The same shape as a segment, because it is the same kind of thing: one
     press that settles something. */
  .shuffle {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--configurator-control-edge);
    border-radius: var(--configurator-radius-inner);
    background: var(--configurator-sunken);
    color: var(--configurator-text);
    font: inherit;
    font-size: var(--configurator-text-small);
    cursor: pointer;
    transition: border-color var(--configurator-transition);
  }

  .shuffle:hover {
    border-color: var(--configurator-accent-lit);
  }

  .shuffle:focus-visible {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  .shuffle > i {
    color: var(--configurator-accent);
    font-size: var(--configurator-glyph);
    line-height: 1;
  }

  :global(.segmented) {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--configurator-control-edge);
    border-radius: var(--configurator-radius-inner);
    background: var(--configurator-sunken);
  }

  /* The segments carry the radius of the track less the padding around them,
     so the chosen one sits inside the curve rather than against it. */
  :global(.segmented__item) {
    padding: 0.3rem 0.4rem;
    border: none;
    border-radius: max(calc(var(--configurator-radius-inner) - 2px), 0px);
    background: none;
    color: var(--configurator-text-muted);
    font: inherit;
    font-size: var(--configurator-text-small);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition:
      background var(--configurator-transition),
      color var(--configurator-transition);
  }

  :global(.segmented__item:hover) {
    color: var(--configurator-text);
  }

  /* The chosen segment carries the accent and the accent behind it, because
     colour alone asks a reader to compare two greys. */
  :global(.segmented__item[data-state="checked"]) {
    background: var(--configurator-accent-surface);
    color: var(--configurator-accent);
  }

  :global(.segmented__item:focus-visible) {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: -2px;
  }

  :global(.switch) {
    display: inline-flex;
    align-items: center;
    width: 2.5rem;
    height: 1.5rem;
    padding: 2px;
    border: 1px solid var(--configurator-control-edge);
    border-radius: 999px;
    background: var(--configurator-sunken);
    cursor: pointer;
    transition: background var(--configurator-transition);
  }

  :global(.switch[data-state="checked"]) {
    border-color: var(--configurator-accent);
    background: var(--configurator-accent-surface);
  }

  :global(.switch:focus-visible) {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }

  /* The thumb moves by transform rather than by a margin or a position, which
     is the one property of the three a compositor animates. */
  :global(.switch__thumb) {
    display: block;
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 999px;
    background: var(--configurator-edge);
    transition:
      transform var(--configurator-transition),
      background var(--configurator-transition);
  }

  :global(.switch[data-state="checked"] .switch__thumb) {
    background: var(--configurator-accent);
    transform: translateX(1rem);
  }

  :global(.slider) {
    position: relative;
    display: flex;
    align-items: center;
    height: 1.25rem;
    touch-action: none;
  }

  /* The track is drawn rather than outlined: at six pixels a rule around it is
     two thirds of its height, and what was left inside read as a hole. It
     carries the edge colour, because a slider is a control and WCAG 2.1 asks
     3:1 under 1.4.11 for what bounds one, at the strength a filled bar wants
     rather than the one a line does. */
  .slider__track {
    position: relative;
    display: block;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: var(--configurator-edge-quiet);
  }

  :global(.slider__range) {
    position: absolute;
    height: 100%;
    border-radius: 999px;
    background: var(--configurator-accent);
  }

  /* A mark is cut out of the track rather than laid on it, so it reads the same
     where the range has passed it and where it has not: one dark colour tells
     against the track and against the accent alike. */
  :global(.slider__tick) {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 2px;
    margin-top: -1px;
    border-radius: 999px;
    background: var(--configurator-base);
    transform: translateX(-50%);
  }

  :global(.slider__thumb) {
    display: block;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 999px;
    border: 1px solid var(--configurator-accent);
    background: var(--configurator-accent);
    cursor: grab;
  }

  :global(.slider__thumb:focus-visible) {
    outline: 2px solid var(--configurator-accent-lit);
    outline-offset: 2px;
  }
</style>
