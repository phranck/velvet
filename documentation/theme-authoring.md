# Velvet status-page themes: the build manual

This is the working manual for building a Velvet status-page design. It is written to be read cold, by whoever comes next, and it assumes no memory of how the existing themes were made.

**Scope.** This governs the status pages a Velvet installation publishes. The velvet.li website is not covered by any of it and does not change.

Two rules for reading it. Every claim names the file it comes from, and every figure was measured rather than estimated. Where a decision could have gone another way, the alternative is stated with the reason it was not taken.

---

## 1. What a theme is

One stylesheet that declares custom properties and no rules. Dropping a different one in changes the colour, the typography, the shape of every surface, the texture behind the page, the arrangement of the parts, and the motion. It changes nothing about what the page says or which elements exist.

Six exist today, in `site/mockups/themes/`, with one page each in `site/mockups/`. Run them:

```bash
bun run --cwd site dev
```

Then open `http://localhost:5173/mockups/`.

| Theme | Era | What it is | What it forced into the token set |
| --- | --- | --- | --- |
| `velvet` | today | The page Velvet publishes now | Nothing. It is the baseline, and it proved the token set can express the product it came from |
| `cassette` | 1979 | The cassette itself: shell charcoal, a cream write-on label under every service name, the printed label head across the top, oxide brown for unrecorded tape | Masked edges, because `clip-path` cuts a `border` off |
| `populuxe` | 1958 | Manila paper, vermilion and petrol, capsule segments, a geometric sans over an italic serif | Separate brand and accent, after they measured 0.3 degrees apart |
| `vector` | 1982 | Unfilled surfaces, lit edges, a horizon grid, a five-line graticule | `--surface-card: transparent` |
| `twenty-forty-nine` | 2049 | A filthy pane of glass with a dim blue readout: corner brackets, edge scales, dotted grids, a vignette to black | `--card-ornament-*` and `--card-texture` |
| `ncc-1701-d` | 2364 | A divided column of coloured segments carrying the service names, an elbow whose arm is the range bar | `--service-rail-*`, `--range-bar-*`, `--row-inset`, `--toggle-padding-inline`, one-layout support |

---

## 2. The hard limit, and what follows from it

**CSS cannot rebuild the document.** An element written into the service row does not move into the navigation bar, however the stylesheet is written, unless both are children of the same layout container.

Three consequences, and all three are design rules rather than obstacles.

**The markup carries the union of every design.** Where one design wants a coloured segment beside the whole row and five do not, the segment exists in the markup and five themes set `--service-rail-display: none`. Where a design wants corner brackets, they are background layers on an element that exists for the purpose and is hidden elsewhere.

**Anything drawn rather than laid out reads its measurements back.** That is exactly two things, both covered in section 4.

**A theme may declare that it supports only one layout.** `--layout-cards: none` and the control that would contradict the design is not offered.

---

## 3. Where a theme joins the pipeline

**This pipeline is not changed by any of this.** It is verified and it works.

1. `action.yml:54` turns the consumer's `velvet.yml` into `site/public/config.json`.
2. `action.yml:63` builds the site with Vite.
3. `site/vite.config.ts:29` runs the `prerenderStatusPage` plugin.
4. That plugin renders `App.svelte` on the server and, at `site/vite.status-prerender.ts:183`, writes the result into the document together with a `<style>` block containing `:root { … }`.
5. `action.yml:64` and `:65` generate the social card and the SEO files.
6. `action.yml:70` copies the built site to where GitHub Pages publishes it.

**Step 4 is the seam.** Those properties come from `themeCustomProperties` in `site/src/lib/config.ts:138`, which merges the installation's colours from `themeCssVariables` (`:142`), its fonts, and the shared geometry from `tokenCssVars` in `site/src/lib/tokens.ts:92`. The comment at `vite.status-prerender.ts:180` says why it is a stylesheet and not a script: a prerendered page is then in its own colours at first paint instead of arriving in a fallback palette and repainting.

A theme therefore ships either as a stylesheet linked before the bundle, or as further entries in that `:root` block. **Which of the two has not been decided.** Both work with the pipeline exactly as it stands.

Related: issue #463 removes the Configurator's visual surface in favour of curated designs, keeping three capabilities for an operator, namely editing services, switching the design and publishing maintenance messages.

---

## 4. The two things that are drawn rather than laid out

Almost everything is boxes, and CSS positions those. Two things are not, and both read the current theme back through `site/mockups/read-tokens.ts`, using `getComputedStyle`, so a value arrives fully resolved: a `calc()` evaluated, a `color-mix()` mixed, a custom property pointing at another followed.

### The availability strip is a canvas

`site/src/components/UptimeBar.svelte` draws it on a canvas rather than one element per day. The comment at line 277 records why with figures: over six expand-all cycles at 90 days with four services, 695ms of rasterisation as elements against 315ms as a canvas.

`site/mockups/uptime-strip.ts` is that component with the geometry read back rather than imported. Otherwise faithful, including the order in which a day's colour is decided: **a day nothing was measured on takes the no-data colour whatever its recorded status says**, because such a day can still be recorded as operational and reading the status first would paint an empty day as a working one.

**The narrow radius applies at `quarter` only, not at `year`**, following `UptimeBar.svelte:54`. That reads like an oversight and is not: a year is 53 weekly buckets whilst a quarter is 90 single days, so a year's bars are about twice as wide.

**Four tokens shape the track**, and they are what stop six themes having the same bar:

- `--bar-align`: `center`, `top` or `bottom`. Centred keeps the strip symmetrical; anchored to an edge it grows away from that edge and reads as a meter.
- `--bar-pieces`: how many stacked blocks one segment is drawn as. One is a solid bar; four is a lamp meter.
- `--bar-piece-gap`: the gap between those blocks.
- `--bar-track-radius`: rounds only the outer ends of the first and last segment, which turns a row of separate objects into one divided bar.

### The response chart is arithmetic

`ResponseTimeChart.svelte` states its plot box as module constants: `WIDTH` at line 36, `HEIGHT` at 37, the plot edges from 38, `MAX_POINTS` at 42, `TOOLTIP_WIDTH` at 43. `site/mockups/chart-view.ts` takes the same values from tokens.

The curve is drawn by `monotonePath` from `site/src/lib/response-chart.ts`, imported rather than reimplemented, so a mockup cannot show a smoother line than the real page would.

`WIDTH` stays a constant on purpose. The chart scales to its container, so that number is a drawing unit rather than a size. The height is a token, because the proportion of the plot is a design decision.

### What the mockups share with the product, and what they do not

Imported, so they cannot drift:

- `monotonePath`, `filterResponseSeries`, `downsampleResponseSamples`, `availableResponseTimestamps`, `nearestResponseTimestamp`, `responseValuesAtTimestamp`, `responseRangeWindow` from `response-chart.ts`
- `barsForRange`, `uptimeForRange`, `overallStatus`, `visibleIncidentEvents`, `RANGE_LABEL`, `STATUS_HERO` from `data.ts`
- `disclosure` from `disclosure.ts`
- the validators from `@velvet/contracts`
- the icons from `@phosphor-icons/web/duotone`

Rebuilt, and therefore able to drift: `chart-view.ts` against `ResponseTimeChart.svelte`, `uptime-strip.ts` against `UptimeBar.svelte`, `page.ts` against `StatusPage.svelte` and the service components. **This is a known cost.** One instance has already occurred: an `aria-label` added in the mockup replaced the button's contents and stopped the uptime figure being announced, which the real component does not do. It is fixed, and the lesson is that a change to behaviour in one has to be checked against the other.

---

## 5. Overlays are never clipped

Both hover overlays are appended to the document and positioned against their anchor. `site/mockups/overlay.ts` is the only place that logic lives.

This is not a preference. The card carries a `clip-path` in the chamfered themes and the disclosure wrapper carries `overflow: hidden` in every theme, and **`position: fixed` escapes the second but not the first**: a `clip-path` clips every descendant however it is positioned.

Measured before the fix: the strip tooltip stood 12px above the card's top edge and 18px to its left under one theme, inside a `clip-path`, and the chart overlay had a clipping ancestor in all of them.

The overlay flips to the other side when the preferred one does not fit, clamps to a margin from every window edge, and re-reads its anchor on scroll and resize, because scrolling moves the anchor without moving the pointer.

---

## 6. The token set

191 required tokens in 34 groups. Print the current list with every theme's value beside it:

```bash
bun ./mockups/verify.ts --tokens
```

Never keep that list in prose. It drifts within a week.

What follows is why each group exists and what varies inside it.

**Identity.** Name, era, `color-scheme`.

**Surface.** Six values. `--surface-card` accepts `transparent`, and that is not a convenience: one design has no filled surfaces at all. The contrast gate handles it by measuring against the page behind.

**Text.** Three levels plus three for a popover, because a theme may invert there.

**Brand and accent.** `--accent` is what the interface points with; `--brand-primary` is the mark; `--nav-brand-colour` is separate again, because a theme may fill its bar and the mark then stands on that fill.

**State.** Five states, two protocols, two edge colours. The two edges are easy to overlook: one marks a planned window, the other is the only thing that says a segment exists on a day nothing was recorded.

**Typography.** Three families. Two is not enough, because timestamps want tabular figures whilst incident summaries want prose; five would mean each theme choosing five faces that agree. One theme uses one face for all three, which is period-correct. Another keeps its display face off anything read at length, because it is unreadable in a paragraph.

A theme that names a face ships it. The mockups fetch theirs from a font host, which is the one respect in which they differ from a theme that would ship: a published status page must not wait on a third party to report on its own availability.

**Shape.** `--card-radius` and `--card-clip` are separate because a chamfered corner is a polygon and a capsule is a radius. `--card-radius-base` exists beside `--card-radius` because the derived geometry needs a single number and one theme's card is `22px 22px 22px 6px`.

**Card rail, ornament and texture.** Three groups that exist because two designs need surfaces the others do not. The rail is a coloured band down the leading edge. The ornament is an element for corner brackets, edge scales and label heads, drawn as background layers because doing it with real elements would mean sixteen per card. The texture is a pattern on the card itself.

**Service row.** `--service-areas` and `--service-columns` decide whether a row is one column or two. The two-column form puts a coloured segment carrying the name beside everything the row shows. `--service-name-display` and `--service-icon-display` let a design drop either. `--row-inset` is the single inset every part of the row shares, so the summary, the strip, the axis and the panel all end on the same vertical.

**Range bar.** In five themes a plain row above the card. In one it is the arm of an elbow, with a fill, a height, a radius, a stem and a concave throat, and the controls live inside it. It carries its own foreground tokens, because everything in a filled bar stands on that fill.

**Arrangement.** `--nav-justify`, `--hero-align`, `--range-justify` and `--footer-align` are what make one theme right-ranged and another centred with the same markup. `--nav-gap` is separate from the general row gap, because a bar that pushes its parts to opposite edges never shows the value whilst a centred one shows nothing else.

`--hero-areas` and `--hero-columns` decide where the status mark goes. Centred, it stands above the words: anything beside a centred line stops the line being centred. Ranged left or right, it moves onto the same line at the headline's own size and centres against it, and both columns are content-width so the pair stays together.

**Backdrop and motion.** The backdrop is two fixed layers rather than a background. Measured in `site/src/app.css:92`: over eight expand-all cycles, 5809ms of rasterisation as a background against 485ms as a layer, layout unchanged at 12ms either way. Line 97 notes `background-attachment: fixed` does not help and measured 7127ms.

Motion is sparse. Three of six themes move nothing. The three that do animate the backdrop layer only, through `background-position` or `opacity`, at nine, seven and twenty-one seconds a cycle. Everything optional stops under `prefers-reduced-motion: reduce`.

`--velvet-disclosure-duration` must carry the same value as `--motion-disclosure`, because `site/src/lib/disclosure.ts:22` reads that exact name.

---

## 7. The gates

Two scripts, run from `site/`.

```bash
bun ./mockups/verify.ts            # reads the files
bun ./mockups/verify-rendered.ts   # reads what a browser resolved
```

### What `verify.ts` checks

1. **No design values in `base.css`.** Hex, `rgb()`, `hsl()`, named font families, literal shadows. The mockup toolbar is excluded by a marker comment.
2. **Completeness.** Every token `base.css` reads is defined by every theme. Sixteen are exempt as structural or optional.
3. **Contrast.** Text reaches 4.5:1 against page and card. State colours reach 3:1, because the strip and the chart are graphics. Translucent colours are flattened first; an unfilled card is measured against the page behind it.
4. **Separation of meaning.** `--accent` and `--state-outage` at least 45 degrees apart in OKLCH hue, and the three state colours pairwise. Where either colour is within 0.04 of grey, the pair is separated by chroma and the hue test does not apply.
5. **Fixture validity.** The dummy data checked with the product's own validators, not the raw schemas, because those check duplicate identifiers, timestamps outside the monitoring window and contradictory durations.

### What `verify-rendered.ts` checks, and why it had to exist

A file-searching gate has three holes, and a review found all three by exploiting them:

- Eighteen tokens drive the strip and the chart and are read through `getComputedStyle` rather than named in `base.css`, so a gate deriving its list from `base.css` never asked for them. Deleting eight left every gate green whilst the chart silently fell back to another theme's values.
- The literal search stops at a marker comment with no closing one, so anything appended to `base.css` is unchecked.
- A declaration is collected from anywhere in a theme file, including a selector matching nothing, so a dead value can be measured whilst the page renders from something else.

All three disappear when the question is asked of the page. This gate:

1. **Resolves every token in every theme**, on `.status-page` rather than on the root, and fails on any that comes back empty.
2. **Fingerprints each theme** and fails if two render identically, which is what a theme that failed to load looks like.
3. **Switches every theme to every other in a live document** and fails if any token keeps a value from the previous one. Thirty switches for six themes.

The third is the one that matters in the product: an installation changes its design by changing one file, and a value that survives the change is a page rendering as two designs at once.

### The one gate still missing

One screenshot per theme and per page, compared against the last accepted one. Described here and not built.

---

## 8. Traps, each of which cost a build

Everything here was found by building. Each is a case where the design would have shipped wrong.

**A `var()` at the root pointing at a derivation further down computes to nothing.** A custom property containing `var()` resolves on the element that declares it. `--row-inset: var(--card-text-inset)` at `:root`, against a derivation on `.status-page`, comes back empty and fails silently. Both derivations now sit on `:root`. This bit twice, first with `--detail-radius` and then with `--row-inset`.

**`inherit` on a custom property at the root resolves against nothing.** `--service-name-colour: inherit` comes back empty. `currentColor` is what was meant.

**A `clip-path` cuts the border off.** A border is painted outside the padding box and `clip-path` cuts afterwards, so a chamfered card loses its border along exactly the two corners the chamfer creates. Every edge is now a masked ring cut by the same `clip-path`, which also serves a plain radius.

**A radial gradient without an explicit radius defaults to `farthest-corner`.** On a square that is the diagonal, so a concave curve came out 1.41 times too large and never appeared. Always write `circle <length> at …`.

**`border-color` before the `border` shorthand is overwritten by it.** The idle outline on a control silently did nothing.

**Vermilion and the outage red are the same colour.** The first 1958 draft used vermilion for both the accent and the outage state; in OKLCH they sit **0.3 degrees apart**. Petrol became the accent, vermilion stayed as the brand. The separation gate exists because of this.

**A dark palette does not become a light one by inverting.** On the light theme the era's vermilion measures **3.65:1** on manila, which fails for text; the darkened variants measure **4.02:1 to 6.53:1**.

**Warm palettes run out of hue.** Oxide brown for a working day measured **11.5 degrees** from the amber warning. The brown moved to the empty day and the state took the meter's green.

**A filled band needs its own foreground tokens.** A hero on a filled band loses the state colour; a range bar that is an elbow's arm loses the page's text colours. Both have overrides.

**A left- or right-ranged footer collides with the fixed stamps.** Measured: **7px horizontally and 16px vertically**. The footer's bottom padding is derived from the stamp's own inset and size.

**The hero mark must follow the state.** The first build showed a green mark above "major service outage". The colour now comes from a `data-status` attribute in `base.css`.

**A fixture can satisfy the types and still be invalid.** Response-time samples ran back a year whilst monitoring started 300 days earlier; the validator rejected it with `TIMESTAMP_OUT_OF_RANGE`.

**Three type sizes on one line need a leading of 1.** Left at the inherited leading each box is a different height and the letters sit at different depths, so a centred row reads as stepped.

**A fixed-width column breaks a phone.** 210px of a 320px screen. Every fixed measure that carries content is a `clamp()`.

**An `aria-label` replaces the contents rather than adding to them.** Labelling the service button with only the name stopped the uptime figure being announced. It now carries name, figure and protocols, and is rewritten when the range changes.

---

## 9. Building the next theme

1. **Pick the era and name what is unforgettable about it.** One sentence. If it is only a palette, it is not a design.
2. **Copy the closest existing theme.** The table in section 1 says what each one is.
3. **Work through the groups in order.** Every token gets a value.
4. **Decide the shape and the strip deliberately.** This is what separates a design from a recolour. Ask what a panel *is* here: a box, a field beside a rail, a chamfered plate, a bracketed region, or nothing. Then ask what a day *is*: a block, a capsule, a tick, a stack, or part of one divided run.
5. **Run both gates.** Expect failures on the first run; every theme had them.
6. **Add the page.** Copy any HTML file, change the one `<link>`, add an entry to `site/mockups/main.ts` and a card in `site/mockups/index.html`.
7. **Drive it in a browser and read figures back.** All five ranges, both overlays, the disclosure, the chart's arrow keys, both layouts, and 320, 375 and 430 pixels wide.
8. **Then look at it.** Measuring proves the geometry; only looking catches a shape that is technically correct and visually wrong. Both are required, and in that order.
9. **If the design needs something no token expresses, add the token**, set it neutrally in the others, and record the trap in section 8.

---

## 10. What is not settled

**How a theme reaches a published page.** Section 3 names the seam and shows both routes work unchanged.

**Three prerequisites are not implemented in the product.** The mockups close them; `UptimeBar.svelte`, `ResponseTimeChart.svelte` and the components carrying scoped styles do not. Measured: 5595 of 6380 CSS lines are scoped across 69 components, holding 831 `var()` references against 97 raw colour values but 917 raw lengths.

**How an installation picks a design.** Issue #463.

**The screenshot gate.** Described, not built.

**The mockups need a dev server.** They import TypeScript from `site/src/lib/` directly, which is deliberate: the arithmetic cannot drift from the product's. The cost is that they do not open from the filesystem.
