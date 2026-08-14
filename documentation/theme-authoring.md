# Velvet status-page designs: the build manual

This is the working manual for building a design a Velvet installation can publish its status page in. It is written to be read cold, by whoever comes next, and it assumes no memory of how the existing designs were made.

**Scope.** This governs the status pages a Velvet installation publishes. The velvet.li website is not covered by any of it and does not change.

Two rules for reading it. Every claim names the file it comes from, and every figure was measured rather than estimated. Where a decision could have gone another way, the alternative is stated with the reason it was not taken.

---

## 1. What a design is

A directory under `site/bundles/`, named for the design, carrying everything it needs:

```
site/bundles/<id>/
  bundle.json     the manifest, which is all the host reads before loading anything
  template.ts     builds the markup from the data, as a string
  bundle.css      the whole appearance
  script.ts       behaviour, attached to markup that already exists
  assets/         typefaces, pictures, anything the design references
```

The three entry names are conventions rather than rules: the manifest says which file is which, so a design may call them whatever it likes. What is not negotiable is that everything the bundle references lives inside the directory and is addressed relative to it.

**A design owns its own markup.** Two designs share the status data and nothing else. Where one wants a coloured segment beside every row and another wants nothing there, the first emits the segment and the second does not emit anything: neither has to declare a value that hides the other's element.

Four designs exist today, and they are the four an installation can be published in. Open them:

```bash
bun run --cwd site dev
```

Then open `http://localhost:5173/gallery/`.

| Design | Era | What it is |
| --- | --- | --- |
| `velvet` | today | The page Velvet publishes now. The baseline the others are compared against rather than a design of its own |
| `retro-chassis` | 1979 | A rack of separate components: each service is a brushed faceplate bolted between two walnut cheeks, carrying a recessed name plate lit from behind, two protocol lamps, a two-line readout, a lamp meter for its days, and its response times on the lit scale of a receiver. A striped sun stands behind the status, and there is not one picture anywhere |
| `twenty-forty-nine` | 2049 | A filthy pane of glass with a dim blue readout: corner brackets, edge scales, dotted grids, a vignette to black |
| `ncc-1701-d` | 2364 | A divided column of coloured segments carrying the service names, two limbs enclosing the notices and the readings, and a table of events rather than a stack of cards |

**Redundancy between designs is intended rather than tolerated.** A design that borrows nothing still works on its own, and that is the point. Where code is genuinely worth sharing it lives in the foundation, and using it is optional. What must stay true regardless of how a design is built is that the figures on the page are right and that the page can be used with a keyboard. Neither is enforced by making every design run through the same code; both are enforced by the conformance suite, against what a design actually rendered from a known fixture.

### Why it is arranged this way

The previous arrangement was one markup, one structural stylesheet and a set of custom properties every design had to declare. `base.css` read 423 of them, of which 128 were used by exactly one design: 72 by `ncc-1701-d`, 52 by `retro-chassis`, 4 by `twenty-forty-nine`.

The count was not the problem. Seven design decisions of one session could not be expressed as a value at all and needed changes to the shared markup or the shared script: the two-line readout, the aluminium key with its lamp, both protocols as lamps, the range labels moving out of the drawing, the printed scale, the pointer, and clipping a fill to the letters of a name. Each of those forced the other three designs to declare properties they set to nothing.

---

## 2. The manifest

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

`layouts` and `readings` are fields because both used to be read out of a computed style: a toolbar read `--layout-cards` to decide which layout buttons to offer, and the page read `--service-display-display` to decide where a reading was shown. **Nothing about a design is discovered by inspecting its stylesheet.**

A manifest is reported on in full rather than at the first fault, because a design with two mistakes should not have to be fixed twice.

---

## 3. The data, and its version

A design receives one object, already loaded and already validated: `BundleData` in `site/src/lib/bundles/data.ts`. It carries the installation as the operator configured it (`site`), the three contract documents unchanged (`status`, `incidents`, `responseTimes`), and the moment the data was generated.

The shape carries a version because a design outlives the release that produced it. `BUNDLE_DATA_VERSION` is what the host hands out today; `SUPPORTED_BUNDLE_DATA_VERSIONS` is everything it can still hand out. A manifest naming anything else is refused before a byte of its stylesheet is loaded. Raising the version is for a change a design cannot survive, so a field removed, renamed, or given a different meaning. Adding a field a design may ignore is not that.

**The template is a function returning a string** rather than a tree, because the same function has to run in the build, which has no DOM, and in a preview frame, which does. A tree would force the build to carry a DOM implementation to serialise it.

**The script is handed the element the markup was put into**, and the same data. Anything it returns is called when the page goes away, which is what lets a preview frame swap one design for another without leaving observers and listeners behind.

---

## 4. The four rules, each with a gate

```bash
bun run --cwd site bundles:verify
```

`site/src/lib/bundles/isolation.ts` holds the rules and `site/test/bundle-isolation.test.ts` holds their tests, including the near misses each rule must *not* report.

1. **Self-contained.** Every `url()`, `import` and `src` resolves inside the bundle. Nothing points at another bundle, at the site, or at a remote host. Two things are allowed through: a type-only import, because TypeScript erases the statement and nothing is ever loaded, and the foundation, imported as `@velvet/foundation/<part>`. A design declares neither; it imports what it needs and the build writes that code into it.
2. **Fonts ship with the bundle.** A published status page must not wait on a third party in order to report on its own availability, and a German operator should not be made to send their visitors to a font host without having chosen to. A `@font-face` whose `src` leaves the bundle fails the same rule.
3. **Styles stay inside the bundle's own root.** No selectors on `html`, `body`, `:root` or `*`, and no `!important`. The check reads the first compound of every selector rather than searching for words, so `.status-body` is not mistaken for `body`.
4. **Data is given, not fetched.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or `importScripts`. The host loads the data, validates it, and hands the design a typed object.

The gate reads text and opens no browser, so it fails in the time it takes to read a directory rather than after a build. What a browser resolved is a different question with a different gate.

### What rule 3 means in practice

A design declares everything on its own root element, and that element is what its template returns. The document's colour scheme, its scrolling behaviour and its margins belong to whatever is publishing the page.

Two consequences are easy to miss.

**The root element carries its own background, and it is a stacking context.** The backdrop layers behind the page are negative-`z` children of that element. A negative-`z` child is painted *after* the background of the element it belongs to, so without `isolation: isolate` the layers are laid over the page's own colour rather than behind the content. The old arrangement got away with it because a `body` with no background of its own propagates its colour to the canvas and paints no box at all.

**Every state the page can be in is an attribute on that same element.** `data-status` is what the page is announcing, and `data-notices` says whether anything is being reported. A design that colours a shape by the state reads `var(--status-colour)`, which its own stylesheet resolves from the attribute.

### Shipping the faces

```bash
bun run --cwd site bundles:fonts
```

`site/scripts/bundle-fonts.ts` copies the faces each design names out of its `@fontsource` package into `assets/fonts/`, writes the `@font-face` rules that name them into `assets/fonts.css`, and copies each licence beside the files. It also cuts the Phosphor duotone face down to the glyphs that design actually shows and writes `assets/icons.css`. A design that shows no icons gets neither file, which is how `retro-chassis` pays nothing for a face it never names.

The rules are written by the same script that copies the files, because a `@font-face` names a file that has to exist and the two are one decision. An icon the face does not define fails the script rather than shipping: left to the browser it renders as an empty box, which is how a misremembered name once reached a review.

---

## 5. The conformance suite, and the fixtures it runs against

The property contract asked whether 418 named values existed and resolved, which says nothing about whether the page is right: a design can declare every property in the set and still print last week's uptime beside a service nobody can reach with a keyboard. The suite asks the other question.

```bash
bun run --cwd site bundles:conform                                  # every design, every fixture
bun run --cwd site bundles:conform -- --bundle retro-chassis             # one design
bun run --cwd site bundles:conform -- --fixture long-names          # one case
```

It serves each bundle over a real HTTP origin, renders its template from a fixture, runs its script, and then asks of the page:

- Every service's name appears, and beside it its uptime figure for the chosen range. **The figure is compared against what `uptimeForRange` in `site/src/lib/data.ts` computes from the same fixture**, so a design that does its own arithmetic and gets it wrong fails here. That is what makes the redundancy between designs safe.
- Every incident `visibleIncidentEvents` returns appears, with its title.
- The version, the serial number and the line naming where the page is configured all appear.
- Exactly one `h1`.
- Every interactive element is reachable with Tab and has a name a screen reader would announce.
- Nothing overflows a 320px viewport.
- Text meets 4.5:1, or 3:1 where it is large. Text over a background image is not measured, because no static reading of one is honest.
- No request leaves the bundle's own origin.
- The focus ring is the design's own: the focused element must look different from the resting one, and `outline-style` must not be `auto`, which is how a browser draws its own.

**The fixtures** live in `site/bundles/fixtures/` and are used by the gallery, the suite and the screenshot workflow alike. Eight cases: the ordinary installation (`velvet-underground`, five services with three hundred days behind them), and seven that break designs rather than flatter them, namely the first day of an installation with no history, everything unknown, one service, twenty services, very long service names, an incident summary of two thousand characters, and a service reachable over IPv6 only.

Every fixture is checked against the product's own validators rather than the raw schemas, because the validators catch what a schema cannot: duplicate identifiers, timestamps outside the document's own window, and durations that contradict each other. `site/test/bundle-fixtures.test.ts` is that gate, and it needs no browser.

### What the suite found on the first four designs

It is worth recording, because every one of them had passed the property gates.

- The tertiary text of the page Velvet publishes measures **2.79:1** on a card, against the 4.5:1 body text needs. Two other designs carried the same fault at **3.69:1** and **3.82:1**. All three are lifted in their bundles to the lowest value that passes, and the shipping product is issue #471.
- An unlit protocol lamp measured **1.99:1** against its own dark fill. A lamp that is out is a reading, and a reading nobody can read is not one.
- `ncc-1701-d` came to **338px** in a 320px window: the last range button ended at 337.9 and a notice at 324.2. Three floors came down together, because dropping one of them only moves which element is the widest.
- `retro-chassis` came to **351px**, with the three lines under the rack measuring 338.5px on one row. They stack below 560px now.

---

## 6. The foundation: what is worth sharing, offered rather than imposed

Some things are worth sharing, and those live in `packages/foundation` as `@velvet/foundation`. **A design that uses none of them is complete.**

A part of the foundation owns behaviour, never markup. It draws into an element the design gives it, or answers a question the design asks. It never assumes what the page around it looks like, never selects an element it was not handed, and never declares a style outside the element it was given. Everything it draws is described by options the design passes, so two designs using the same part need not look alike.

| Part | What it carries | Why it is worth sharing |
| --- | --- | --- |
| `status` | The arithmetic behind every figure | 99.97 per cent over thirty days is the same number in every design. Two rules in it are the ones a second implementation gets wrong, and both turn a page into a lie: a day before monitoring began is not a perfect day, and a day nothing was measured on is not an operational one |
| `uptime-strip` | A month of days on a canvas, and the rule that decides a day's colour | 695ms of rasterisation as elements against 315ms as a canvas, over six expand-all cycles at 90 days with four services |
| `response-chart` | The range arithmetic, the curve, and the time scale | `monotonePath` is what the product draws with, so no design can show a smoother line than the real page would, and `responseScaleTicks` is what places a mark, so no design can print a scale that divides the window into anything the window is not made of |
| `disclosure` | A panel that animates its own height | Two frames longer than 32ms out of roughly 250, measured in WebKit expanding and collapsing six services, which is what the same page produces with no animation at all |
| `overlay` | A floating reading on the document's own layer | `position: fixed` escapes `overflow` but not `clip-path`, so the only thing that works is not being a descendant |

**A design declares nothing about what it uses.** It imports the part it wants, the build writes that code into it, and the manifest says nothing on the subject. The isolation gate allows any specifier under `@velvet/foundation/` and refuses every other import that leaves the bundle, which is one rule rather than a list to keep in step with the code.

There is no version number on any of this. An installation is pinned to a release of Velvet, so a change here reaches a published page when its operator takes an update and not before, and a design is built against the ground it ships with.

Nothing here obliges a design to use any of it. A design that draws its own strip is allowed, and the conformance suite is what catches it if the drawing lies.

### Passing the foundation its appearance

A style option may be a value or a function returning one. **Prefer the function wherever the values come from the design's own custom properties**, because a stylesheet arrives when it arrives: a palette read once, before the stylesheet applied, is a strip drawn in nothing at all. That is not hypothetical, it is what the gallery showed on its first run.

Values that only the drawing uses belong in the script rather than in the stylesheet. The strip's segment height, the plot's inset and the tick lengths are read by nothing else, and a custom property nothing reads is a value with two homes.

---

## 7. The two things that are drawn rather than laid out

Almost everything is boxes, and CSS positions those. Two things are not.

### The availability strip is a canvas

`site/src/components/UptimeBar.svelte` draws it on a canvas rather than one element per day. The comment at line 277 records why with figures: over six expand-all cycles at 90 days with four services, 695ms of rasterisation as elements against 315ms as a canvas.

The strip in the foundation is that component with the appearance taken from the design rather than from a shared token set. It is otherwise faithful, including the order in which a day's colour is decided: **a day nothing was measured on takes the no-data colour whatever its recorded status says**, because such a day can still be recorded as operational and reading the status first would paint an empty day as a working one.

**The narrow radius applies at `quarter` only, not at `year`**, following `UptimeBar.svelte:54`. That reads like an oversight and is not: a year is 53 weekly buckets whilst a quarter is 90 single days, so a year's bars are about twice as wide.

**Four values shape the track**, and they are what stop two designs having the same bar:

- `align`: `center`, `top` or `bottom`. Centred keeps the strip symmetrical; anchored to an edge it grows away from that edge and reads as a meter.
- `pieces`: how many stacked blocks one segment is drawn as. One is a solid bar; four is a lamp meter.
- `pieceGap`: the gap between those blocks.
- `trackRadius`: rounds only the outer ends of the first and last segment, which turns a row of separate objects into one divided bar.

### The response chart is arithmetic

**The design is handed the plot, and everything around it is the design's own markup.** The caption, the legend and the two ends of the range are written in the template and styled directly, the way the strip's dates already were. The chart is given the plot element, draws the SVG into it and nothing outside it, and hands back what a design cannot work out for itself: the legend arrives as one entry per protocol that answered, carrying the protocol, its name and its latest reading, and the range's left end is the same `rangeLabel` the strip is labelled with.

A design that wants no legend therefore writes none. `retro-chassis` does exactly that, because the trace's colours are the two protocol windows above it and a key repeating them labels something already labelled.

This is what the rule at the head of section 6 asks of every part, and until then the chart was the one that broke it. It built the caption, the legend, the plot frame and the axis row itself, which left every design steering that structure from a distance: 42 custom properties across the four of them, against one for the strip, and most of them declared to switch off something another design wanted.

`ResponseTimeChart.svelte` states its plot box as module constants: `WIDTH` at line 36, `HEIGHT` at 37, the plot edges from 38, `MAX_POINTS` at 42. In the foundation they are a style object a design passes, and the proportion of the plot becomes a design decision rather than a constant.

The curve is drawn by `monotonePath` from `site/src/lib/response-chart.ts`, imported rather than reimplemented.

`VIEW_WIDTH` stays a constant on purpose. The chart scales to its container, so that number is a drawing unit rather than a size.

**The value axis climbs in a round figure, and the top of it is that figure times the number of steps.** How many steps there are is `gridLines` less one, which the design states, because that is how dense a grid it wants. What each step is worth is `responseAxisStep`, which takes the readings and returns one of 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten, with a floor at ten milliseconds. Scaling to the highest reading instead made every service look alike: one running at 96ms and one at 412ms both filled the plot to the top, and the shape said nothing about how slow either was. A fixed step of twenty milliseconds fixed that and produced 220 and 1060 once the readings left the range it was chosen for, which is why the step is now a figure rather than a multiple. Measured across the five services of the ordinary fixture, with five rules: 10, 20, 30 and 40; 40, 80, 120 and 160; 50, 100, 150 and 200; 100, 200, 300 and 400; 150, 300, 450 and 600. The axis never stands more than half again above the readings it holds.

This is not full comparability, and it should not be mistaken for it. Each service's axis still ends at its own rounded maximum. Sharing one axis across every service would fix that, at the cost of flattening a fast service into a line along the floor. That trade was put to phranck on 2026-08-10 and the per-service axis was kept.

**The time scale is divided by the window rather than by the drawing.** A design states the two tick lengths and nothing else; `responseScaleTicks` decides where a mark stands. It picks the finest unit out of hour, six hours, day, two days, week, month and year whose count does not pass sixty, and counts back from the right edge so that "now" always carries a long mark. A window of thirty days therefore carries a mark a day and a long one every five, a window of a year carries a mark a week, and a window of six hours on a fresh installation carries a mark an hour. Before this the step was a fixed distance across the drawing, which came to 81 marks in every range alike and said nothing about time at all.

**A reading with no neighbour is drawn as a ring**, filled with the panel's own colour so it sits on the panel rather than on the page. A service in a running outage produces a run of them, which is what it looks like when a measurement stands alone.

**The pointer is drawn last, after the scale.** An SVG paints in document order, so a scale appended after the crosshair stands in front of it. The order inside the plot is the grid, the value figures, the traces, the printed scale, the two axis lines, and then the strip the pointer rides on. Whatever a design draws over the plot from CSS, such as the shadow of a window cut into a plate, lies over all of it.

**The reading under the pointer may go to the design instead.** Both drawings take an optional reporter, one string per line. Given one, they hand over what they would have shown and draw no overlay; given none, they behave as before. `retro-chassis` uses it to read on a panel of its own, which is what a machine of that period does.

---

## 8. Overlays are never clipped

Both hover overlays are appended to the document and positioned against their anchor. The `overlay` part is the only place that logic lives.

This is not a preference. A card may carry a `clip-path`, the disclosure wrapper carries `overflow: hidden`, and **`position: fixed` escapes the second but not the first**: a `clip-path` clips every descendant however it is positioned.

Measured before the fix: the strip tooltip stood 12px above the card's top edge and 18px to its left under one design, inside a `clip-path`, and the chart overlay had a clipping ancestor in every one of them.

The overlay flips to the other side when the preferred one does not fit, clamps to a margin from every window edge, and re-reads its anchor on scroll and resize, because scrolling moves the anchor without moving the pointer.

**An overlay on the document inherits nothing from where it came from.** The chart's reading is appended to the body so nothing can clip it, which also means a colour set on the service is not there. A design that colours a series by service hands those colours over, once per render rather than once per pointer move.

---

## 9. The host: how a design reaches a published page

**Naming one.** `statusPage.design` in `velvet.yml` reaches the page as `design` in `config.json`. An installation that names nothing is published exactly as before.

**When it cannot be served, the build stops.** An unknown name, or a design reading a status data version this release does not serve, fails the build with a message naming what exists. There is deliberately no fallback: the name comes from the operator's own configuration, so a typo is fixed in a second, whilst a silent fallback publishes somebody else's design under their domain with no way for them to tell. A stopped build also leaves the last published page exactly as it was, which is the safer failure for a page people open when something is already broken. `selectBundle` in `site/src/lib/bundles/host.ts` is where that is decided.

**A layout the design does not support.** The design wins. `layoutFor` picks the design's first supported layout over what an installation configured, because a layout a design cannot draw is not a layout.

**The page is still prerendered.** `site/vite.bundle-page.ts` renders the design's template at build time and writes the markup into the document, so a reader gets the page in its own colours at first paint instead of a fallback palette that repaints. It costs less than it did, because a template is a pure function returning a string and the build needs no DOM and no component runtime to call it.

Three things follow from a design being a whole page rather than values injected into one:

- The `:root` block goes. A design carries its own appearance, and nothing of `themeCustomProperties` reaches it.
- The component page is not built at all when a design is named. The two are alternatives, chosen in `site/vite.config.ts` before the build starts.
- The stylesheet is imported by the generated entry rather than linked by hand, so Vite emits it beside the page and rewrites every `url()` in it, which is how a design's own typefaces and pictures reach the published site without the design knowing where they landed.

**A first run has no data.** A design never fetches, so a page built before the first check has run cannot fill itself in later. It is given empty documents, and every design answers that with the state it shows when nothing is known, which is the truth about an installation that has not measured anything yet.

**A design is previewed in a frame of its own.** `site/src/lib/bundles/preview.ts` renders one into a document of its own with the design's stylesheet inlined, so nothing a design declares can reach the tool around it. The frame runs no script: choosing how a page should look is not using the page.

---

## 10. The gallery

`site/gallery/` opens one document per design and embeds each of them in a frame. That is what makes "one document carries one design" true by construction rather than by convention: nothing is shared between two frames, so a design that declared something reaching past its own root could still only reach its own page.

The stylesheet is linked rather than inlined, because a design's typefaces and pictures are addressed relative to it and a frame written as `srcdoc` has no address for them to resolve against. This is also how a published page loads it, so what the gallery shows is what an installation would get.

The one control is which installation to render, and the choices are the fixtures the conformance suite runs against. A design that looks wrong there is a design that will look wrong on somebody's page.

---

## 11. Traps, each of which cost a build

Everything here was found by building. Each is a case where a design would have shipped wrong.

**A `var()` at the root pointing at a derivation further down computes to nothing.** A custom property containing `var()` resolves on the element that declares it, so a reference to a derivation living further down comes back empty and fails silently. Declare every derivation on the element the values referencing it are declared on. This bit three times.

**`inherit` on a custom property at the root resolves against nothing.** `--service-name-colour: inherit` comes back empty. `currentColor` is what was meant.

**A negative-`z` layer is painted over the background of the element it belongs to.** A page element with a background of its own and a backdrop layer behind it needs `isolation: isolate`, or the layer covers the colour it was meant to sit on.

**A stylesheet arrives when it arrives.** A palette read once, at the moment a script runs, may be read before the stylesheet applied, and a drawing given empty colours draws in nothing at all. Pass a function and let the drawing re-read it.

**A figure a design asks for is not always a figure that can be seen.** A grid at 18 per cent of the panel's own colour measured 1.32:1 against it, which is below what an eye separates: the grid was drawn, and nobody could find it. Anything meant to be read has to clear 3:1, and anything meant to recede has to be checked the other way round, because a fill at 1.14:1 is a shadow rather than a bar. Measure both directions and report the figure.

**A `clip-path` cuts the border off.** A border is painted outside the padding box and `clip-path` cuts afterwards, so a chamfered card loses its border along exactly the two corners the chamfer creates. Draw the edge as a masked ring inside the element and let the same `clip-path` cut it.

**A `border-radius` larger than its box is scaled down, silently.** Where two radii along one edge exceed that edge, the browser scales *every* corner of the box by the same factor until they fit. A 68px outer corner on a 44px-deep arm therefore rendered as 44px, and the cap at the arm's other end, declared at 22px, came out at 14px because it was scaled by the same 0.65. Nothing reports this: `getComputedStyle` gives back the declared value, not the drawn one. A corner larger than the box it is on belongs on a neighbouring element that is big enough for it.

**A radial gradient without an explicit radius defaults to `farthest-corner`.** On a square that is the diagonal, so a concave curve came out 1.41 times too large and never appeared. Always write `circle <length> at …`.

**`border-color` before the `border` shorthand is overwritten by it.** The idle outline on a control silently did nothing.

**Vermilion and the outage red are the same colour.** One draft used vermilion for both the accent and the outage state; in OKLCH they sit **0.3 degrees apart**. Two colours that mean different things have to be separated by hue, or by chroma where one of them is near grey.

**A dark palette does not become a light one by inverting.** On a light design the era's vermilion measures **3.65:1** on manila, which fails for text; the darkened variants measure **4.02:1 to 6.53:1**.

**Warm palettes run out of hue.** Oxide brown for a working day measured **11.5 degrees** from the amber warning. The brown moved to the empty day and the state took the meter's green.

**A filled band needs its own foreground colours.** A hero on a filled band loses the state colour; a range bar that is an elbow's arm loses the page's text colours.

**A left- or right-ranged footer collides with anything fixed to the same corner.** Measured: **7px horizontally and 16px vertically**.

**`min-height: 100vh` scrolls a page with nothing to scroll.** `vh` is the height a phone's browser has once its own bars have gone, so a page sized in `vh` scrolls under a visible address bar. Use `dvh`.

**A grid item set to `display: none` gives its column away.** A footer row of `1fr auto 1fr` with the version, the credit and the serial in it does not leave the credit in the middle when the two figures are hidden: it is auto-placed into the first column and sits **302px** left of centre. Every child of a track-based grid names its own column.

**The hero mark must follow the state.** The first build showed a green mark above "major service outage".

**A fixture can satisfy the types and still be invalid.** Response-time samples ran back a year whilst monitoring started 300 days earlier; the validator rejected it with `TIMESTAMP_OUT_OF_RANGE`.

**Three type sizes on one line need a leading of 1.** Left at the inherited leading each box is a different height and the letters sit at different depths, so a centred row reads as stepped.

**A fixed-width column breaks a phone.** 210px of a 320px screen. Every fixed measure that carries content is a `clamp()`, and every design is checked at 320px by the conformance suite for exactly this reason.

**An `aria-label` replaces the contents rather than adding to them.** Labelling a service button with only the name stopped the uptime figure being announced. It carries name, figure and protocols, and is rewritten when the range changes.

**A shape behind the status mark decides how much room the mark takes.** The first build centred a 172px disc on a 44px glyph and it crossed the headline.

**Text trimming is what makes a bar meet a headline.** A line box does not end where the letters do: at 34px one face leaves 7px of leading above the capitals and below the baseline. `text-box` trims the box to the letters. A line carrying descenders trims to its text edge rather than to its baseline, or they hang over whatever comes next: measured at 2.6px across the first notice.

**Tracking is added after the last letter as well as between them.** A centred label therefore sits half a step left of the box it is centred in, and a right-ranged headline stops short of the box's own end: measured at 2.04px of tracking, the glyphs ended at 1032 whilst both boxes ended at 1034.

---

## 12. Building the next design

1. **Pick the era and name what is unforgettable about it.** One sentence. If it is only a palette, it is not a design.
2. **Copy the closest existing bundle.** The table in section 1 says what each one is. Copying is the intended way: designs are redundant on purpose.
3. **Rename the root class and the directory**, and write the manifest.
4. **Decide the shape, the strip and the plot deliberately.** This is what separates a design from a recolour. Ask what a panel *is* here: a box, a field beside a rail, a chamfered plate, a bracketed region, or nothing. Then ask what a day *is*: a block, a capsule, a tick, a stack, or part of one divided run.
5. **Name the faces in `site/scripts/bundle-faces.ts` and run `bundles:fonts`.** A design that shows no icons gets no icon face. Add each face to `THIRD_PARTY_NOTICES.md` in the same step, because that file is what ships as the attribution and `site/test/third-party-notices.test.ts` holds the two lists against each other.
6. **Run both gates.** `bundles:verify` first, because it fails in a second; then `bundles:conform`. Expect failures on the first run; every design had them.
7. **Drive it in the gallery and read figures back.** All five ranges, all three overlays, every fixture, the disclosure, the chart's arrow keys, both layouts if the manifest claims both, and 320, 375 and 430 pixels wide.
8. **Then look at it.** Measuring proves the geometry; only looking catches a shape that is technically correct and visually wrong. Both are required, and in that order.
9. **Photograph it for the start page.** `bun run --cwd site designs:screenshots` renders every design on the `all-well` fixture and writes the pictures the start page shows, then add it to `site/src/website/design-gallery.ts` beside its picture.
10. **Record whatever cost you a build in section 11**, with the figure that showed it.

---

## 13. What is not settled

**The screenshot gate.** One screenshot per design and per fixture, compared against the last accepted one. Described here and not built. The conformance suite catches what a page says and whether it can be used; it cannot catch a shape that moved.

**Which faces a design may carry.** Every face shipped today is under the SIL Open Font License, which allows redistribution inside a larger work provided the licence travels with the file. Two were asked for and refused: Okuda, the fan face cut from the LCARS lettering, is licensed for personal use only, and Tungsten is Hoefler & Co's and may not be copied, distributed or hosted without an agreement with them. Neither can travel to somebody else's installation. Antonio, under the SIL Open Font License, is what `ncc-1701-d` uses and what thelcars.com substitutes for the same reason.

**The component page still exists.** An installation that names no design gets it, and it carries the same tertiary text colour that fails contrast in every design derived from it. That is issue #471.

**How an operator picks a design.** Issue #463.
