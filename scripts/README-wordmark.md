# Regenerating the wordmark outlines

`velvet-wordmark.json` holds the Velvet wordmark as a single SVG path, together with the width it advances by. The board backdrop draws it from there rather than as text, because an SVG used as a CSS background renders in isolation and never resolves the page's web fonts. Outlines are the only way it looks like the real logo.

The path is generated from the Plaster face that ships with `@fontsource/plaster`, and the extraction needs a font library rather than a browser. That is the one step in this repository that runs Python, which is why it lives here as a recipe rather than as a script in the build. It runs when the brand changes, and nothing else does.

Two things read the file afterwards. The board backdrop draws the whole word from it, and `site/scripts/generate-mark.ts` takes the first two contours, which are the V, and builds the Velvet mark and the browser icon out of them.

## What the numbers mean

The outlines are normalised so the cap height is exactly 100 and the baseline sits at `y = 0`, with the letters above it at negative `y`, which is what SVG expects. `advanceWidth` is the width the whole word occupies at that scale. The board scales both by the width it wants the identity block to be, so neither number has to be touched when the layout changes.

## The recipe

Run this from the repository root, with `fonttools` and `brotli` available:

```python
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

FONT = "site/node_modules/@fontsource/plaster/files/plaster-latin-400-normal.woff2"
WORD = "Velvet"

font = TTFont(FONT)
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()
scale = 100 / font["OS/2"].sCapHeight

parts = []
cursor = 0.0
for character in WORD:
    name = cmap[ord(character)]
    pen = SVGPathPen(glyphs)
    # y is flipped, because SVG counts downwards whilst a font counts upwards.
    glyphs[name].draw(TransformPen(pen, Transform(scale, 0, 0, -scale, cursor, 0)))
    parts.append(pen.getCommands())
    cursor += glyphs[name].width * scale

document = {
    "wordmark": WORD,
    "path": "".join(parts),
    "advanceWidth": round(cursor, 2),
    "capHeight": 100,
    "source": {
        "font": "Plaster",
        "package": "@fontsource/plaster 5.3.0",
        "file": "files/plaster-latin-400-normal.woff2",
        "license": "OFL-1.1, Sorkin Type Co, reserved font name Plaster",
        "command": "scripts/README-wordmark.md records how to regenerate this",
    },
    "geometry": "Baseline at y=0, cap height reaching y=-100, advancing from x=0.",
}
with open("scripts/velvet-wordmark.json", "w") as handle:
    json.dump(document, handle, indent=2)
    handle.write("\n")
```

Redraw the mark as well, from the `site` directory, with `bun scripts/generate-mark.ts` followed by `bun scripts/generate-favicons.ts`. The first writes the mark and the icon, and the second rasterises the icon into the sizes a browser and a home screen need.

## Licensing

Plaster is licensed OFL-1.1 by Sorkin Type Co, with Plaster as a reserved font name. The outlines derived from it carry that licence, which `THIRD_PARTY_NOTICES.md` records.
