# @velvet/foundation

The ground every status-page theme stands on.

A theme is self-contained: a directory with a manifest, a template, a stylesheet, a script and its own assets, and what it publishes borrows nothing at run time. It stands on shared ground all the same, because the arithmetic behind a figure and the drawing of a curve are not design decisions. That ground is here, and the build writes it into each theme, so what an installation receives still stands on its own.

## What a part is

A module with a small surface that a theme imports and calls. It owns behaviour, never markup: it draws into an element the theme gives it, or answers a question the theme asks. It never assumes what the page around it looks like, never selects an element it was not handed, and never declares a style outside the element it was given.

Everything it draws is described by options the theme passes, so two themes using the same part do not have to look alike. A part takes a style object, or a function returning one for a theme whose values come from its own custom properties. A function is re-read on every paint, which is what lets a drawing follow a stylesheet that arrived after the script did.

A theme declares nothing about which parts it uses. It imports what it needs, the build bundles that in, and a theme that imports none of it is complete.

## The five

| Part | What it is | Why it is worth sharing |
| --- | --- | --- |
| `status` | The arithmetic behind every figure a page prints | What a figure *is* is not a design decision: 99.97 per cent over thirty days is the same number in every theme, and a page printing a different one is wrong rather than distinctive. Two rules in it are the ones a second implementation gets wrong, and both turn a page into a lie: a day before monitoring began is not a perfect day, and a day nothing was measured on is not an operational one |
| `uptime-strip` | A month of days drawn on a canvas | 695ms of rasterisation as elements against 315ms as a canvas, over six expand-all cycles at 90 days with four services. It also carries the rule that decides a day's colour, which is the one place where a plausible-looking mistake shows a green day where nothing was measured |
| `response-chart` | The range arithmetic and the curve | `monotonePath` is what the product draws with, so no theme can show a smoother line than the real page would |
| `disclosure` | A panel that animates its own height | Two frames longer than 32ms out of roughly 250, measured in WebKit expanding and collapsing six services, which is what the same page produces with no animation at all |
| `overlay` | A floating reading on the document's own layer | `position: fixed` escapes `overflow` but not `clip-path`, so the only thing that works is not being a descendant |

## Changing one

Everything here ships inside the theme that imports it, and an installation is pinned to a release of Velvet, so a change reaches a published page when its operator takes an update and not before. That is what carries the risk a version number used to carry: a theme is built against the ground it ships with, and the two travel together.

The conformance suite is what says whether the ground still holds. It renders every theme against every fixture and compares the figures on the page against what the arithmetic computes from the same data.

## Using one

```ts
import { createUptimeStrip } from "@velvet/foundation/uptime-strip";

const strip = createUptimeStrip(host, {
  className: "retro-chassis-strip",
  style: () => ({ align: "bottom", pieces: 4, operational: "#c8ff9a" }),
});
strip.update(days, "month");
```
