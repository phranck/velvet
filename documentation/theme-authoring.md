# Velvet status-page themes: the build manual

This is the working manual for building a Velvet status-page design. It is written to be read cold, by whoever comes next, and it assumes no memory of how the existing themes were made.

**Scope.** This governs the status pages a Velvet installation publishes. The velvet.li website is not covered by any of it and does not change.

Two rules for reading it. Every claim names the file it comes from, and every figure was measured rather than estimated. Where a decision could have gone another way, the alternative is stated with the reason it was not taken.

**Start at [section 11](#11-theme-bundles-the-format-that-replaces-the-token-contract) if you are building a design now.** A design is a self-contained bundle: a directory with a manifest, a template, a stylesheet, a script and its own assets. Sections 1 to 10 describe the shared-markup-and-token arrangement it replaces; everything they say about drawing (4, 5) and the traps (8) still holds, and the property contract (6, 7) does not.

---

## 1. What a theme is

One stylesheet that declares custom properties and no rules. Dropping a different one in changes the colour, the typography, the shape of every surface, the texture behind the page, the arrangement of the parts, and the motion. It changes nothing about what the page says or which elements exist.

Four exist today, in `site/mockups/themes/`, with one page each in `site/mockups/`. Run them:

```bash
bun run --cwd site dev
```

Then open `http://localhost:5173/mockups/`.

| Theme | Era | What it is | What it forced into the token set |
| --- | --- | --- | --- |
| `velvet` | today | The page Velvet publishes now | Nothing. It is the baseline, and it proved the token set can express the product it came from |
| `cassette` | 1979 | A rack of separate components: each service is a brushed faceplate bolted between two walnut cheeks, carrying a recessed name plate lit from behind, two protocol lamps, a two-line readout, a lamp meter for its days, and its response times on the lit scale of a receiver. A striped sun stands behind the status, and there is not one icon anywhere | Masked edges, because `clip-path` cuts a `border` off; the shape behind the status mark; the typed disclosure mark; the plot's own surface, its printed scale and its pointer; the two-line readout and the readings routed into it; both protocols as lamps; a design that supports one layout being the cards one |
| `twenty-forty-nine` | 2049 | A filthy pane of glass with a dim blue readout: corner brackets, edge scales, dotted grids, a vignette to black | `--card-ornament-*` and `--card-texture` |
| `ncc-1701-d` | 2364 | A divided column of coloured segments carrying the service names, two limbs enclosing the notices and the readings, and a table of events rather than a stack of cards | `--service-rail-*`, `--range-bar-*`, the hero's three blocks, the notice's own geometry and cells, the ten service colours, the chart's axes, `--row-inset`, one-layout support |

Two were dropped: `populuxe`, a 1958 manila-and-vermilion design, and `vector`, a 1982 wireframe. What they forced into the token set stayed, because it is general: separate brand and accent, after the two measured 0.3 degrees apart, and `--surface-card: transparent` with the contrast gate measuring through it.

---

## 2. The hard limit, and what follows from it

**CSS cannot rebuild the document.** An element written into the service row does not move into the navigation bar, however the stylesheet is written, unless both are children of the same layout container.

Three consequences, and all three are design rules rather than obstacles.

**The markup carries the union of every design.** Where one design wants a coloured segment beside the whole row and five do not, the segment exists in the markup and five themes set `--service-rail-display: none`. Where a design wants corner brackets, they are background layers on an element that exists for the purpose and is hidden elsewhere.

**Anything drawn rather than laid out reads its measurements back.** That is exactly two things, both covered in section 4.

**A theme may declare that it supports only one layout.** `--layout-cards: none` where a design's structure runs the height of the whole readout, `--layout-grouped: none` where each service is an instrument of its own, and the control that would contradict the design is not offered. The page opens in the first layout that is left.

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

**Four tokens shape the track**, and they are what stop the themes having the same bar:

- `--bar-align`: `center`, `top` or `bottom`. Centred keeps the strip symmetrical; anchored to an edge it grows away from that edge and reads as a meter.
- `--bar-pieces`: how many stacked blocks one segment is drawn as. One is a solid bar; four is a lamp meter.
- `--bar-piece-gap`: the gap between those blocks.
- `--bar-track-radius`: rounds only the outer ends of the first and last segment, which turns a row of separate objects into one divided bar.

### The response chart is arithmetic

`ResponseTimeChart.svelte` states its plot box as module constants: `WIDTH` at line 36, `HEIGHT` at 37, the plot edges from 38, `MAX_POINTS` at 42, `TOOLTIP_WIDTH` at 43. `site/mockups/chart-view.ts` takes the same values from tokens.

The curve is drawn by `monotonePath` from `site/src/lib/response-chart.ts`, imported rather than reimplemented, so a mockup cannot show a smoother line than the real page would.

`WIDTH` stays a constant on purpose. The chart scales to its container, so that number is a drawing unit rather than a size. The height is a token, because the proportion of the plot is a design decision.

**The value axis climbs in steps of twenty milliseconds.** `AXIS_STEP` in `chart-view.ts` fixes that step, the number of steps is `--chart-grid-lines` less one, and the top of the axis is the first multiple of the step that covers the readings. Scaling to the highest reading instead made every service look alike: one running at 96ms and one at 412ms both filled the plot to the top, and the shape said nothing about how slow either was. Measured after the change, the share of the plot the trace fills: Database 44 per cent, Website 60, API 66, Mail 69, CDN 85. The step itself grows in multiples of twenty where a slow service would otherwise need twenty-five lines.

This is not full comparability, and it should not be mistaken for it. Each service's axis still ends at its own rounded maximum, so a service twenty-three times slower than another is not drawn twenty-three times taller. Sharing one axis across every service would do that, at the cost of flattening a fast service into a line along the floor. That trade was put to phranck on 2026-08-10 and the per-service axis was kept.

**The grid, the two axes and the scale figures may take the series' own colour.** `base.css` hands each of them `var(--series-own, …)`, so a design that lists a colour per service gets a chart in that service's colour and a design that does not falls back to what it names. Each carries its own strength as a percentage, because an axis that reads as firmly as its grid stops being an axis.

**A reading with no neighbour is drawn as a ring**, filled with `--detail-fill` so it sits on the panel rather than on the page. A service in a running outage produces a run of them, which is what it looks like when a measurement stands alone.

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

395 required tokens in 42 groups, which the rendered gate resolves as 417 because twenty-two more are read only in script and no text search finds them. Print the current list with every theme's value beside it:

```bash
bun ./mockups/verify.ts --tokens
```

Never keep that list in prose. It drifts within a week.

What follows is why each group exists and what varies inside it.

**Identity.** Name, era, `color-scheme`.

**Surface.** Six values. `--surface-card` accepts `transparent`, and that is not a convenience: one design has no filled surfaces at all. The contrast gate handles it by measuring against the page behind.

**Text.** Three levels plus three for a popover, because a theme may invert there.

**Brand and accent.** `--accent` is what the interface points with; `--brand-primary` is the mark; `--nav-brand-colour` is separate again, because a theme may fill its bar and the mark then stands on that fill.

**State.** Five states, two protocols, two edge colours and a mark for the unknown state. The two edges are easy to overlook: one marks a planned window, the other is what says a segment exists on a day nothing was recorded. A design may draw no such edge, and says so by giving it the fill's own colour; the gate then stops holding the edge to the page and holds the fill apart from a working day instead. `--state-unknown-mark` is named separately from that edge for exactly this reason, because a design that drops the edge would otherwise lose its headline with it.

**Typography.** Three families, and a token per place where the product sets type individually rather than from a general step.

That last part is not decoration. The `velvet` theme reproduces the page Velvet publishes today, and that page states its own size, weight and tracking at nine places: the wordmark at 600, the headline at 700 and -0.8px, the navigation link at 15px, the time under the headline at 15px, the incidents heading at 600 and 0.4px, the group name at 14px, 600 and 0.6px, the range buttons at 13.5px in the page's own face at 400, the uptime figure at 14px, and the stamps at 0.04em. A theme with one display weight cannot say that, and reading them off `StatusPage.svelte`, `StatusHero.svelte`, `Incidents.svelte` and `ServiceSummary.svelte` is what closed the gap between the mockup and the page it copies.

`--headline-font` sits with them: the one line naming the state may be set in a face the design uses nowhere else. `cassette` puts Monoton there, which draws every stroke as a pair of hairlines and is unreadable at paragraph size, and keeps IBM Plex Mono for everything else.

The other three themes point those tokens at their general steps, so nothing changed for them.

Three families. Two is not enough, because timestamps want tabular figures whilst incident summaries want prose; five would mean each theme choosing five faces that agree. One theme uses one face for all three, which is period-correct. Another keeps its display face off anything read at length, because it is unreadable in a paragraph.

A theme that names a face ships it. The mockups fetch theirs from a font host, which is the one respect in which they differ from a theme that would ship: a published status page must not wait on a third party to report on its own availability.

**Shape.** `--card-radius` and `--card-clip` are separate because a chamfered corner is a polygon and a capsule is a radius. No theme cuts a chamfer now, and the token stays because the geometry it expresses has no other form. `--card-radius-base` exists beside `--card-radius` because the derived geometry needs a single number and one theme's card is `22px 22px 22px 6px`.

**Card rail, ornament and texture.** Three groups that exist because two designs need surfaces the others do not. The rail is a coloured band down the leading edge. The ornament is an element for corner brackets, edge scales and label heads, drawn as background layers because doing it with real elements would mean sixteen per card. The texture is a pattern on the card itself.

**Service row.** `--service-areas` and `--service-columns` decide whether a row is one column or two. The two-column form puts a coloured segment carrying the name beside everything the row shows. `--service-name-display` and `--service-icon-display` let a design drop either. `--row-inset` is the single inset every part of the row shares, so the summary, the strip, the axis and the panel all end on the same vertical.

**Range bar.** In most themes a plain row above the card. In one it is the arm of an elbow, with a fill, a height, a radius, a stem and a concave throat, and the controls live inside it. It carries its own foreground tokens, because everything in a filled bar stands on that fill.

The stem is the vertical run below the arm, and it owns the outer corner rather than the arm doing so. The corner is as large as the arm is deep plus the throat, which is what keeps the wall of the elbow one thickness all the way round the turn, and an arm is never tall enough to hold a radius larger than itself. The arm's fill is a background image sized to stop where the stem begins, because a background colour covers the whole box whatever the stem draws and fills the corner back in from underneath.

The chosen range may be set apart by size as well as by the mark. It grows by `transform` rather than by font size, so its box does not change and nothing beside it moves: a real size laid the row out afresh on every change, and giving every label the largest one's width held the row still but spread it out and left gaps belonging to nothing. The mark is widened by the same factor, less whatever `--range-mark-trim` takes off each side, because a label's own padding is scaled up with it.

**The foot of the readings** closes that limb the other way up, through `--service-arm-*`, `--service-stem-*` and `--service-throat`. Arm, stem and throat are one element, so the seam that sets the limb off from the last row falls between that row and the stem rather than across the turn, and the throat sits inside the shape. Every theme but one leaves it undisplayed.

That arm can carry the version and the serial as two segments cut out of it. The cut is a border in the page's own colour on either side of a segment, which is the same step that divides the column above into its own segments, and each segment's margin takes that border back off so its edge still lands where the arithmetic puts it. The version stands on the vertical the readings stand on and states its width rather than taking it from its text, because a release number is short enough that the segment would otherwise be the width of however many digits it happens to carry. The serial keeps clear of the free end by the capsule's own radius, so its seam falls where the arm is still square. A design that shows them here sets `--stamp-display: none`, and the footer then states neither, because the page states each figure once.

A window narrow enough that the two segments meet takes the version off that vertical and back to the arm's own corner. Measured in the one theme that draws the limb: the segments touch at 470px and the page begins to overflow at 435px, so the theme moves the version at 480px.

**Notices.** A notice derives its geometry from its own radius, not the card's: the text stands in by half that radius, and the padding is one value on all four sides. A theme that carries a large corner sets that padding to the derived text inset, so the words clear the curve without the padding going uneven to do it.

The region carries the columns rather than each notice, so a design may lay the notices out as a table with one set of column widths down the whole list; a notice takes them back through `subgrid`. Every cell states its face, size and casing from its own token, because a table wants one face straight across a row whilst a stack of cards wants a heading, a paragraph and a timestamp that differ. `--notice-cell-lines` cuts a row short, and `page.ts` shows the whole of it on hover and on focus only where something is actually cut off.

`--notice-trailing: capsule` asks for a capsule at the free end. That is exactly half the notice's height, which CSS cannot express, so `page.ts` measures it onto the element and `base.css` composes the radius there. Writing a large number instead makes the browser scale every corner of the box down by one factor and flattens the leading corners with it.

**Service colours.** A list of ten, cycling after ten services, which a theme may leave out entirely. Where it lists them, a service's block, its rail segment and its chart all take the same colour, and the second protocol takes the next service's, so the last service closes the run on the first. The chart's overlay lives on the document rather than inside the service and inherits nothing from it, so `chart-view.ts` hands it those colours when it draws, once per render rather than once per pointer move.

**Arrangement.** `--nav-justify`, `--hero-align`, `--range-justify` and `--footer-align` are what make one theme right-ranged and another centred with the same markup. `--nav-gap` is separate from the general row gap, because a bar that pushes its parts to opposite edges never shows the value whilst a centred one shows nothing else.

`--hero-areas` and `--hero-columns` decide where the status mark goes. Centred, it stands above the words: anything beside a centred line stops the line being centred. Ranged left or right, it moves onto the same line at the headline's own size and centres against it, and both columns are content-width so the pair stays together.

The same two tokens let a design make the headline part of a shape. The hero's grid names three further areas, `rail`, `bar` and `arm`. Two are pseudo-elements and the middle one is an element, because a grid area has to be a rectangle and the column is one row shorter than the bar beside it. One design uses them to turn the headline into the interrupted upper arm of the limb that surrounds the notices: the column's head to the left, a run of bar between that and the words, and a capped block after them, with the time under the headline inside the same bar. Where a theme leaves them undisplayed they are not grid items at all, so `--hero-areas` may go on naming areas that nothing fills.

`--hero-title-trim` and `--hero-updated-trim` trim those two lines to their own letters through `text-box`, because a line box does not end where the letters do and a block stretched to the same row would stand proud of them. The headline trims to its baseline and the time to its text edge or its baseline, depending on whether the design wants its descenders inside the bar or hanging below it. `--hero-title-trail` pulls the headline out by its own trailing tracking where a design ranges it right, since tracking is added after the last letter as well as between them: measured at 2.04px of tracking, both boxes ended at 1034 whilst the headline's glyphs stopped at 1032 and the time's reached 1034.7.

**A design may use no pictures at all.** Three groups make that possible, and each is a token rather than a rule so the design decides. `--service-icon-display` and `--notice-glyph-display` drop the glyph beside a service and the one beside a notice. `--hero-glyph-display` drops the status glyph whilst keeping the mark it stands in, so the shape behind it survives. `--disclosure-icon-display` and `--disclosure-mark-display` are a pair: one shows the chevron, the other shows a character stated by `--disclosure-mark-closed` and `--disclosure-mark-open`, and no design shows both. One theme reads `[+]` and `[-]`, which is how a machine of its period would have printed it.

**The control that opens a row may be a key rather than a mark.** `--disclosure-mark-*` gives that element a size, a face, a shape and two shadows, and `--disclosure-led-*` turns what it carries into a pilot light instead of a character. One theme makes it a rectangular aluminium key with a green lamp in the middle: pressed means the response times are showing. Its face is domed by a radial highlight over a vertical gradient and its chamfer is two inset hairlines, one light at the top and one dark at the bottom, because a border cannot be light on one edge and dark on another.

Where a design puts the whole affordance in one key, the row's own hover goes quiet and the key answers instead, through `--summary-hover-fill` and `--disclosure-mark-fill-hover`. The control that opens every row at once answers to nothing in that design, which is what `--toggle-hover-fill` is for: it is not one row's key.

**A design may read on a panel of its own rather than in overlays.** `--service-display-*` turns the space between whatever labels a row and the control that opens it into a two-line readout, with the uptime figure at the end of the first line. Three strengths separate what it is reading from what that reading is of and from the standing figure, and `--service-display-shadow` presses the whole panel into the face. Measured on the glass of the one theme that draws it: 15.07:1, 10.20:1, 5.50:1, with the unlit dots at 1.23:1.

Those unlit dots sit on the lattice the face itself draws on. Measured on a canvas at 100px, Doto's dots stand a tenth of the size apart, are eight hundredths across, and the first sits forty-five thousandths in from where a character begins. A grid of the same step, offset by half a step less that first centre, therefore lands on every dot the face would light. Two further conditions keep a whole line on it: the leading must be a whole number of steps, and so must the advance, which means a tracking of a tenth of the size rather than the six hundredths that first looked right and put every character after the first off the grid. Where a design has none, both the element and its lines are `display: contents` and the row is laid out exactly as it was before the panel existed.

The strip and the chart take an optional reporter, one string per line. Given one, they hand over what they would have shown and draw no overlay; given none, they behave as before. `page.ts` reads `--service-display-display` once at mount to decide which it is, because a mockup page carries one theme for its whole life.

**Both protocols may stand on every row.** The markup carries a badge for each, marked present or absent. A design that treats them as labels hides whatever is absent and hides the pair entirely where a service has one IPv4 check and nothing to compare it with, which is what the product does. One design instead draws them as two lamps, backlit in their own colour, and leaves the one nothing was measured on dark: a lamp that is out is a reading.

**The plot may have a surface of its own.** `--chart-plot-fill`, `--chart-plot-edge-*` and `--chart-plot-inset` give the response chart a face, a frame and room around the drawing. One theme paints a receiver's scale there: a lamp glowing behind the glass, the trace running from edge to edge with no value axis, and a printed scale of ticks below it with the two range labels under that.

That scale is drawn in the chart rather than as a background, through `--chart-tick-*`, because it belongs between the readings and those labels and both of those are in the drawing's own units: a scale positioned in pixels drifts away from them as the chart scales. `--chart-needle-*` replaces the crosshair's dots with the strip of plexiglass a receiver reads through, sized in the stylesheet and centred on the reading by a transform against its own box, since only the theme knows the width to halve. The overlay measures the drawing rather than its container, because room around the drawing would otherwise be carried into the scale and put the crosshair beside the pointer.

**A name may be cut rather than printed.** `--service-name-font`, `--service-name-weight`, `--service-name-tracking` and `--service-name-transform` give it a face, a weight, a tracking and a casing of its own, and `--service-name-clip: text` clips the fill to the letters so a gradient becomes the metal they are cut from. One theme sets its services in Tangerine's bold, filled with polished brass. A script needs its own casing, because upper case in such a face is a row of ornaments rather than a word.

That clip cost a rule. Ten rules used to paint the name by position, each setting the `background` shorthand at a higher specificity than the rule that sets the clip, and a shorthand resets the clip to its initial value: the clip was declared, computed to `border-box`, and nothing said why. The name now reads `--series-own` directly, which the same cycle already sets per row, so the fill and the clip sit in one declaration block and neither can be undone without the other.

**A card may be built as an object with two ends.** `--card-padding-top` and `--card-padding-bottom` each fall back to the card's own padding, so a design that draws something across an end holds its content clear of it whilst everything else keeps one value on four sides. One theme closes its cards with a plate at either end, the printed stripes on the top one only, and screws with a hexagonal socket in each corner. The socket is a small drawing rather than a gradient, because a gradient cannot be a hexagon and two background layers cannot be made to intersect.

**A plate may be set into the face rather than printed on it.** `--service-name-shadow` is a shadow inside its own edge with none outside, `--service-name-trim` cuts the line box back to the letters so centring them is exact, and `--service-name-stroke-*` with `--service-name-glow` light the lettering rather than print it. One theme mills the plate into the plastic, lays a liquid-crystal grid over it and lights the word from behind with a red lamp. Measured on the rendered pixels at four times: the ink stands 56 device pixels from the top of the plate and 61 from the bottom, so the letters sit within a pixel of centre and the rest is the font's own overshoot.

**The status mark may stand on a shape.** `--hero-mark-shape-*` gives it a fill, a size and a radius, and the radius clips the fill, so a gradient of hard-stopped bands inside a round element is a striped disc and needs no mask. The shape decides how much room the mark takes, which is what keeps the words below it clear of a shape larger than the glyph: the first build centred a 172px disc on a 44px glyph and it crossed the headline.

**The bar at the top carries the installation's name and nothing else.** `StatusPage.svelte` drops the single entry a default configuration holds, because its address is the page itself, so a published installation shows no links unless its operator has written some into `velvet.yml` by hand. The mockups therefore show none either, whilst `--nav-link-*` stays in the contract for the installation that has them. `status.musiccloud.io` is the reference: a bar, a logo in the middle of it, nothing beside it.

`--nav-rule-*` is the line under that bar, and it is an element rather than a `border-bottom` because a border cannot be rounded on its own or held to the page measure. `--nav-rule-fill` is what it is painted with rather than a colour, since two themes put a gradient there: one draws a capsule in the state's own colour, and one prints a five-block band across the window in the way a deck of its period prints one across its faceplate.

**State colour.** `--status-colour` is what the page is announcing, resolved in `base.css` from a `data-status` attribute, and any part of a design may read it. It is set on `:root` rather than further down, because a theme declares its tokens on `:root` and a `var()` in such a declaration resolves there. A theme that colours a shape by the state writes `var(--status-colour)` into that shape's own token.

**The wordmark is not a theme's to set.** Only its colour is. The face, the size, the weight, the tracking and the casing are the mark itself, taken from `VelvetWordmark.svelte`: Plaster at 400 and 24px with no tracking and no transform. `--brand-font` exists so `base.css` can name it without holding a literal, and every theme sets it to the same value and loads the face.

**The footer stands at the foot of the readings in all four themes.** `--footer-position` can hold it at the foot of the window instead, and `--footer-fill` is what it then needs, because the readings scroll underneath it and a transparent band would show them through. One theme did that and no longer does: a band that covers the readings has to be reckoned with by everything that scrolls under it, and the two figures it hid were the second defect it caused.

The window's height is stated on the document and the page takes what is left, rather than the page stating that height itself. A footer held to the foot of the window makes the difference visible at once: a page as tall as the window, with anything at all above it, is taller than the window by that much and scrolls with nothing to scroll to.

**Backdrop and motion.** The backdrop is two fixed layers rather than a background. Measured in `site/src/app.css:92`: over eight expand-all cycles, 5809ms of rasterisation as a background against 485ms as a layer, layout unchanged at 12ms either way. Line 97 notes `background-attachment: fixed` does not help and measured 7127ms.

Motion is sparse. Two of the four themes move nothing. The three that do animate the backdrop layer only, through `background-position` or `opacity`, at nine, seven and twenty-one seconds a cycle. Everything optional stops under `prefers-reduced-motion: reduce`.

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
2. **Completeness.** Every token `base.css` reads is defined by every theme. A short list is exempt as structural or optional: values `base.css` resolves itself from a data attribute, values a script measures onto an element, the derived card and notice geometry, and the ten service colours, which a theme may leave out entirely to colour by protocol instead.
3. **Contrast.** Text reaches 4.5:1 against page and card. State colours reach 3:1, because the strip and the chart are graphics. Translucent colours are flattened first; an unfilled card is measured against the page behind it.
4. **Separation of meaning.** `--accent` and `--state-outage` at least 45 degrees apart in OKLCH hue, and the three state colours pairwise. Where either colour is within 0.04 of grey, the pair is separated by chroma and the hue test does not apply.
5. **Fixture validity.** The dummy data checked with the product's own validators, not the raw schemas, because those check duplicate identifiers, timestamps outside the monitoring window and contradictory durations.

### What `verify-rendered.ts` checks, and why it had to exist

A file-searching gate has three holes, and a review found all three by exploiting them:

- Nineteen tokens drive the strip and the chart and are read through `getComputedStyle` rather than named in `base.css`, so a gate deriving its list from `base.css` never asked for them. Deleting eight left every gate green whilst the chart silently fell back to another theme's values.
- The literal search stops at a marker comment with no closing one, so anything appended to `base.css` is unchecked.
- A declaration is collected from anywhere in a theme file, including a selector matching nothing, so a dead value can be measured whilst the page renders from something else.

All three disappear when the question is asked of the page. This gate:

1. **Resolves every token in every theme**, on `.status-page` rather than on the root, and fails on any that comes back empty.
2. **Fingerprints each theme** and fails if two render identically, which is what a theme that failed to load looks like.
3. **Switches every theme to every other in a live document** and fails if any token keeps a value from the previous one. Twelve switches for four themes.

The third is the one that matters in the product: an installation changes its design by changing one file, and a value that survives the change is a page rendering as two designs at once.

### The one gate still missing

One screenshot per theme and per page, compared against the last accepted one. Described here and not built.

---

## 8. Traps, each of which cost a build

Everything here was found by building. Each is a case where the design would have shipped wrong.

**A `var()` at the root pointing at a derivation further down computes to nothing.** A custom property containing `var()` resolves on the element that declares it. `--row-inset: var(--card-text-inset)` at `:root`, against a derivation on `.status-page`, comes back empty and fails silently. Both derivations now sit on `:root`. This bit three times: `--detail-radius`, then `--row-inset`, then `--status-colour`, which was held on the page element whilst every theme that wanted to paint with it declared its tokens on `:root` and got nothing.

**`inherit` on a custom property at the root resolves against nothing.** `--service-name-colour: inherit` comes back empty. `currentColor` is what was meant.

**An overlay on the document inherits nothing from where it came from.** The chart's reading overlay is appended to the body so nothing can clip it, which also means a colour set on the service is not there. `chart-view.ts` hands it the two series colours when it renders. The same shape of mistake, in reverse: a value measured onto an element cannot be read by a declaration on `:root`, which is why the notice's capsule is composed in `base.css` rather than in the theme.

**The contrast gate could not read `color-mix`.** It parsed hex and `rgb()` only, so a theme deriving a colour from another reported as an unresolvable token. It now mixes the one form themes use, two colours in sRGB.

**A figure a theme asks for is not always a figure that can be seen.** A grid at 18 per cent of the panel's own colour measured 1.32:1 against it, which is below what an eye separates: the grid was drawn, and nobody could find it. Anything meant to be read has to clear 3:1, and anything meant to recede has to be checked the other way round, because a fill at 1.14:1 is a shadow rather than a bar. Measure both directions and report the figure.

**A `clip-path` cuts the border off.** A border is painted outside the padding box and `clip-path` cuts afterwards, so a chamfered card loses its border along exactly the two corners the chamfer creates. Every edge is now a masked ring cut by the same `clip-path`, which also serves a plain radius.

**A `border-radius` larger than its box is scaled down, silently.** Where two radii along one edge exceed that edge, the browser scales *every* corner of the box by the same factor until they fit. A 68px outer corner on a 44px-deep arm therefore rendered as 44px, and the cap at the arm's other end, declared at 22px, came out at 14px because it was scaled by the same 0.65. Nothing reports this: `getComputedStyle` gives back the declared value, not the drawn one. A corner larger than the box it is on belongs on a neighbouring element that is big enough for it.

**A radial gradient without an explicit radius defaults to `farthest-corner`.** On a square that is the diagonal, so a concave curve came out 1.41 times too large and never appeared. Always write `circle <length> at …`.

**`border-color` before the `border` shorthand is overwritten by it.** The idle outline on a control silently did nothing.

**Vermilion and the outage red are the same colour.** The first 1958 draft used vermilion for both the accent and the outage state; in OKLCH they sit **0.3 degrees apart**. Petrol became the accent, vermilion stayed as the brand. The separation gate exists because of this.

**A dark palette does not become a light one by inverting.** On the light theme the era's vermilion measures **3.65:1** on manila, which fails for text; the darkened variants measure **4.02:1 to 6.53:1**.

**Warm palettes run out of hue.** Oxide brown for a working day measured **11.5 degrees** from the amber warning. The brown moved to the empty day and the state took the meter's green.

**A filled band needs its own foreground tokens.** A hero on a filled band loses the state colour; a range bar that is an elbow's arm loses the page's text colours. Both have overrides.

**A left- or right-ranged footer collides with the fixed stamps.** Measured: **7px horizontally and 16px vertically**. The footer's bottom padding is derived from the stamp's own inset and size.

**`min-height: 100vh` on the page scrolls a page with nothing to scroll.** Two reasons, and both were measured here. Anything standing above the page adds its own height to the document: the mockup toolbar is **47.6px**, so every page scrolled by **48px** at any window size. And `vh` is the height a phone's browser has once its own bars have gone, so a page sized in `vh` scrolls under a visible address bar as well. The document carries `100dvh` and the page takes what is left of it.

**A grid item set to `display: none` gives its column away.** The footer's row is `1fr auto 1fr` with the version, the credit and the serial in it. Hiding the two figures did not leave the credit in the middle: it was auto-placed into the first column and sat **302px** left of centre. Every child of a track-based grid names its own column, so a design may drop any of them.

**The hero mark must follow the state.** The first build showed a green mark above "major service outage". The colour now comes from a `data-status` attribute on `:root`, which `base.css` turns into `--status-colour`.

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
6. **Add the page.** Copy any HTML file, change the one `<link>`, add an entry to `site/mockups/main.ts` and a card in `site/mockups/index.html`. Removing a theme is the same four places in reverse, plus any comment that named it as evidence.
7. **Drive it in a browser and read figures back.** All five ranges, all three overlays, the four states through the toolbar's own switch, the disclosure, the chart's arrow keys, both layouts, and 320, 375 and 430 pixels wide.
8. **Then look at it.** Measuring proves the geometry; only looking catches a shape that is technically correct and visually wrong. Both are required, and in that order.
9. **If the design needs something no token expresses, add the token**, set it neutrally in the others, and record the trap in section 8.

---

## 10. What is not settled

**How a theme reaches a published page.** Section 3 names the seam and shows both routes work unchanged.

**Three prerequisites are not implemented in the product.** The mockups close them; `UptimeBar.svelte`, `ResponseTimeChart.svelte` and the components carrying scoped styles do not. Measured: 5595 of 6380 CSS lines are scoped across 69 components, holding 831 `var()` references against 97 raw colour values but 917 raw lengths.

**How an installation picks a design.** Issue #463.

**The screenshot gate.** Described, not built.

**Which faces a shipped theme may carry.** The mockups fetch theirs from a font host. Two were asked for and refused on licence: Okuda, the fan face cut from the LCARS lettering, is licensed for personal use only, and Tungsten is Hoefler & Co's and may not be copied, distributed or hosted without an agreement with them. Neither can travel to somebody else's installation. Antonio, under the SIL Open Font License, is what `ncc-1701-d` uses and what thelcars.com substitutes for the same reason.

**The mockups need a dev server.** They import TypeScript from `site/src/lib/` directly, which is deliberate: the arithmetic cannot drift from the product's. The cost is that they do not open from the filesystem.

---

## 11. Theme bundles: the format that replaces the token contract

Sections 1 to 10 describe one arrangement: one markup, one structural stylesheet, and a set of custom properties every design must declare. That arrangement is being replaced, and this section is the format replacing it. Everything about drawing (sections 4, 5) and every trap (section 8) still holds; the property contract (sections 6, 7) does not survive the move.

**Why.** `site/mockups/base.css` reads 423 custom properties, of which 128 are used by exactly one design: 72 by `ncc-1701-d`, 52 by `cassette`, 4 by `twenty-forty-nine`. The count is not the problem. Seven design decisions of the last session could not be expressed as a value at all and needed changes to the shared markup or the shared script, and each of those forced every other design to declare properties it set to nothing.

### What a bundle is

A directory under `site/bundles/`, named for the design, carrying everything it needs:

```
site/bundles/<id>/
  bundle.json     the manifest, which is all the host reads before loading anything
  template.ts     builds the markup from the data, as a string
  bundle.css      the whole appearance
  script.ts       behaviour, attached to markup that already exists
  assets/         typefaces, images, anything the design references
```

The three entry names are conventions rather than rules: the manifest says which file is which, so a design may call them whatever it likes. What is not negotiable is that everything the bundle references lives inside the directory and is addressed relative to it.

`site/bundles/proof/` is a deliberately plain bundle whose only purpose is to prove the format. It is not a design anybody chooses.

### The manifest

`bundle.json`, parsed by `parseBundleManifest` in `site/src/lib/bundles/manifest.ts`:

| Field | What it is |
| --- | --- |
| `id` | Lowercase words joined by hyphens, and identical to the directory name |
| `name` | What an operator sees |
| `description` | One line telling this design from the others |
| `era` | Optional; the period the design belongs to |
| `version` | The bundle's own version, as `major.minor.patch` |
| `dataVersion` | The version of the status data the design understands |
| `entries.template` | The module exporting the markup function |
| `entries.styles` | The stylesheet |
| `entries.script` | The module exporting the behaviour |
| `layouts` | `grouped`, `cards`, or both; at least one |
| `readings` | `panel` or `overlay` |
| `preview` | A picture of the design, inside the bundle |
| `plugins` | The plugins the design uses, each with the major version it expects |

`layouts` and `readings` are fields because both were previously read out of a computed style: the mockup toolbar read `--layout-cards` to decide which layout buttons to offer, and `site/mockups/main.ts` read `--service-display-display` to decide where a reading was shown. **Nothing about a design is discovered by inspecting its stylesheet.**

A manifest is reported on in full rather than at the first fault, because a design with two mistakes should not have to be fixed twice.

### The data, and its version

A bundle receives one object, already loaded and already validated: `BundleData` in `site/src/lib/bundles/data.ts`. It carries the installation as the operator configured it (`site`), the three contract documents unchanged (`status`, `incidents`, `responseTimes`), and the moment the data was generated.

The shape carries a version because a bundle outlives the release that produced it. `BUNDLE_DATA_VERSION` is what the host hands out today; `SUPPORTED_BUNDLE_DATA_VERSIONS` is everything it can still hand out. A manifest naming anything else is refused before a byte of its stylesheet is loaded. Raising the version is for a change a design cannot survive — a field removed, renamed, or given a different meaning. Adding a field a design may ignore is not that.

The template is a function returning a **string** rather than a tree, because the same function has to run in the build, which has no DOM, and in a preview frame, which does.

### The four rules, each with a gate

Run the gate with:

```bash
bun run --cwd site bundles:verify
```

`site/src/lib/bundles/isolation.ts` holds the rules and `site/test/bundle-isolation.test.ts` holds their tests, including the near misses each rule must *not* report.

1. **Self-contained.** Every `url()`, `import` and `src` resolves inside the bundle. Nothing points at another bundle, at the site, or at a remote host. Two things are allowed through: a type-only import, because TypeScript erases the statement and nothing is ever loaded, and a plugin the manifest declares, imported as `@velvet/bundle-plugins/<name>`.
2. **Fonts ship with the bundle.** All six designs fetch their faces from `fonts.googleapis.com` today. A published status page must not wait on a third party in order to report on its own availability, and a German operator should not be made to send their visitors to a font host without having chosen to. A `@font-face` whose `src` leaves the bundle fails the same rule.
3. **Styles stay inside the bundle's own root.** No selectors on `html`, `body`, `:root` or `*`, and no `!important`. The check reads the first compound of every selector rather than searching for words, so `.status-body` is not mistaken for `body`.
4. **Data is given, not fetched.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or `importScripts`. The host loads the data, validates it, and hands the bundle a typed object.

The gate reads text and opens no browser, so it fails in the time it takes to read a directory rather than after a build. What a browser resolved is a different question with a different gate: the conformance suite renders a bundle against a fixture and checks what it said.

### Redundancy between bundles is intended

A design that borrows nothing still works on its own, and that is the point. Where code is genuinely worth sharing it is offered as a plugin, and a plugin is optional. What must stay true regardless of how a design is built is that the figures on the page are right and that the page can be used with a keyboard — and neither is enforced by making every design run through the same code. Both are enforced by the conformance suite, against what a bundle actually rendered from a known fixture.

### The conformance suite, and the fixtures it runs against

The property contract asked whether 418 named values existed and resolved, which says nothing about whether the page is right: a design can declare every property in the set and still print last week's uptime beside a service nobody can reach with a keyboard. The suite asks the other question.

```bash
bun run --cwd site bundles:conform                    # every bundle, every fixture
bun scripts/verify-conformance.ts --bundle proof      # one design
bun scripts/verify-conformance.ts --fixture long-names
```

It serves each bundle over a real HTTP origin, renders its template from a fixture, runs its script, and then asks of the page:

- Every service's name appears, and beside it its uptime figure for the chosen range. **The figure is compared against what `uptimeForRange` in `site/src/lib/data.ts` computes from the same fixture**, so a design that does its own arithmetic and gets it wrong fails here. That is what makes the redundancy between bundles safe.
- Every incident `visibleIncidentEvents` returns appears, with its title.
- The version, the serial number and the line naming where the page is configured all appear.
- Exactly one `h1`.
- Every interactive element is reachable with Tab and has a name a screen reader would announce.
- Nothing overflows a 320px viewport.
- Text meets 4.5:1, or 3:1 where it is large. Text over a background image is not measured, because no static reading of one is honest.
- No request leaves the bundle's own origin.
- The focus ring is the design's own: the focused element must look different from the resting one, and `outline-style` must not be `auto`, which is how a browser draws its own.

**The fixtures** live in `site/bundles/fixtures/` and are used by the gallery, the suite and the screenshot workflow alike. Eight cases: the ordinary installation (`velvet-underground`, the five services the mockups always rendered), and seven that break designs rather than flatter them — the first day of an installation with no history, everything unknown, one service, twenty services, very long service names, an incident summary of two thousand characters, and a service reachable over IPv6 only. Most of the defects found whilst building the six existing designs would have been caught by "twenty services" and "very long names" alone.

Every fixture is checked against the product's own validators rather than the raw schemas, because the validators catch what a schema cannot: duplicate identifiers, timestamps outside the document's own window, and durations that contradict each other. `site/test/bundle-fixtures.test.ts` is that gate, and it needs no browser.

### Plugins: what is worth sharing, offered rather than imposed

Bundles are redundant by design and each works on its own. Some things are still worth sharing, and those live in `packages/bundle-plugins` as `@velvet/bundle-plugins`. **A bundle that uses none of them is complete.**

A plugin owns behaviour, never markup. It draws into an element the bundle gives it, or answers a question the bundle asks. It never assumes what the page around it looks like, never selects an element it was not handed, and never declares a style outside the element it was given. Everything it draws is described by options the bundle passes — a style object, or a function returning one for a design whose values come from its own custom properties — so two designs using the same plugin need not look alike.

| Plugin | What it carries | Why it is worth sharing |
| --- | --- | --- |
| `uptime-strip` | A month of days on a canvas, and the rule that decides a day's colour | 695ms of rasterisation as elements against 315ms as a canvas, over six expand-all cycles at 90 days with four services. The colour rule is the one place where a plausible-looking mistake shows a green day where nothing was measured |
| `response-chart` | The range arithmetic and the curve | `monotonePath` is what the product draws with, so no design can show a smoother line than the real page would |
| `disclosure` | A panel that animates its own height | Two frames longer than 32ms out of roughly 250, measured in WebKit expanding and collapsing six services — what the same page produces with no animation at all |
| `overlay` | A floating reading on the document's own layer | `position: fixed` escapes `overflow` but not `clip-path`, so the only thing that works is not being a descendant |

**Versioning.** Each plugin exports `VERSION`, a whole number, and a bundle names it in its manifest:

```json
"plugins": [{ "name": "disclosure", "version": 1 }]
```

The isolation gate refuses a bundle naming a plugin that does not exist, or one at a version the package no longer offers, and refuses an import of a plugin the manifest did not declare. The number rises when a change would make a design that used the previous version render something else: an option removed or renamed, a default changed, or a drawing rule reversed. Adding an option whose default preserves what already happened does not raise it.

Nothing here obliges a bundle to use any of them. A design that draws its own strip is allowed, and the conformance suite is what catches it if the drawing lies. `site/bundles/proof/` shows the pairing: it borrows the disclosure and does its own arithmetic.

### The host: how a design reaches a published page

**Naming one.** `statusPage.design` in `velvet.yml` reaches the page as `design` in `config.json`. An installation that names nothing is published exactly as before, so bundles are opt-in until the designs themselves are bundles.

**When it cannot be served, the build stops.** An unknown name, or a design reading a status data version this release does not serve, fails the build with a message naming what exists. There is deliberately no fallback: the name comes from the operator's own configuration, so a typo is fixed in a second, whilst a silent fallback publishes somebody else's design under their domain with no way for them to tell. A stopped build also leaves the last published page exactly as it was, which is the safer failure for a page people open when something is already broken. `selectBundle` in `site/src/lib/bundles/host.ts` is where that is decided.

**A layout the design does not support.** The design wins. `layoutFor` picks the design's first supported layout over what an installation configured, because a layout a design cannot draw is not a layout.

**The page is still prerendered.** `site/vite.bundle-page.ts` renders the design's template at build time and writes the markup into the document, exactly as the component page was prerendered and for the reason recorded there: a prerendered page is in its own colours at first paint instead of arriving in a fallback palette and repainting. It costs less than it did — a template is a pure function returning a string, so the build needs no DOM and no component runtime to call it.

Three things follow from a design being a whole page rather than values injected into one:

- The `:root` block goes. A bundle carries its own appearance, and nothing of `themeCustomProperties` reaches a design.
- The component page is not built at all when a design is named. The two are alternatives, chosen in `site/vite.config.ts` before the build starts, so nothing of the one an installation did not choose is published beside the one it did.
- The stylesheet is imported by the generated entry rather than linked by hand, so Vite emits it beside the page and rewrites every `url()` in it — which is how a design's own typefaces and images reach the published site without the design knowing where they landed.

**A first run has no data.** A bundle never fetches, so a page built before the first check has run cannot fill itself in later the way the component page did. It is given empty documents, and every design answers that with the state it shows when nothing is known — which is the truth about an installation that has not measured anything yet.

**The Configurator previews a design in a frame of its own.** `site/src/components/DesignPreview.svelte` renders it into a document of its own with the design's stylesheet inlined, so nothing a design declares can reach the tool around it and no design is ever rendered inside another design's document. The frame runs no script: choosing how a page should look is not using the page.
