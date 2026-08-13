# @velvet/bundle-plugins

Behaviour a status-page design may borrow, offered rather than imposed.

A design is a self-contained bundle: a directory with a manifest, a template, a
stylesheet, a script and its own assets, which borrows nothing and works on its
own. Some things are still worth sharing, and those are here. **A bundle that
uses none of them is complete.**

## What a plugin is

A versioned module with a small surface that a bundle imports and calls. It owns
behaviour, never markup: it draws into an element the bundle gives it, or answers
a question the bundle asks. It never assumes what the page around it looks like,
never selects an element it was not handed, and never declares a style outside
the element it was given.

Everything a plugin draws is described by options the bundle passes, so two
designs using the same plugin do not have to look alike. A plugin takes a style
object, or a function returning one for a design whose values come from its own
custom properties. A function is re-read on every paint, which is what lets a
drawing follow a stylesheet that arrived after the script did.

## The five

| Plugin | What it is | Why it is worth sharing |
| --- | --- | --- |
| `status` | The arithmetic behind every figure a page prints | What a figure *is* is not a design decision: 99.97 per cent over thirty days is the same number in every design, and a page printing a different one is wrong rather than distinctive. Two rules in it are the ones a second implementation gets wrong, and both turn a page into a lie: a day before monitoring began is not a perfect day, and a day nothing was measured on is not an operational one |
| `uptime-strip` | A month of days drawn on a canvas | 695ms of rasterisation as elements against 315ms as a canvas, over six expand-all cycles at 90 days with four services. It also carries the rule that decides a day's colour, which is the one place where a plausible-looking mistake shows a green day where nothing was measured |
| `response-chart` | The range arithmetic and the curve | `monotonePath` is what the product draws with, so no design can show a smoother line than the real page would |
| `disclosure` | A panel that animates its own height | Two frames longer than 32ms out of roughly 250, measured in WebKit expanding and collapsing six services, which is what the same page produces with no animation at all |
| `overlay` | A floating reading on the document's own layer | `position: fixed` escapes `overflow` but not `clip-path`, so the only thing that works is not being a descendant |

## Versioning

Each plugin exports `VERSION`, a whole number, and a bundle names it in its
manifest:

```json
"plugins": [{ "name": "uptime-strip", "version": 1 }]
```

The host refuses a bundle naming a plugin that does not exist or a version this
package no longer offers. The number rises when a change would make a design that
used the previous version render something else: an option removed or renamed, a
default changed, or a drawing rule reversed. Adding an option with a default that
preserves what already happened does not raise it.

## Using one

```ts
import { createUptimeStrip } from "@velvet/bundle-plugins/uptime-strip";

const strip = createUptimeStrip(host, {
  className: "retro-chassis-strip",
  style: () => ({ align: "bottom", pieces: 4, operational: "#c8ff9a" }),
});
strip.update(days, "month");
```
