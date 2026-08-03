# Third-party notices

This file records third-party components and assets used by Velvet. The status
page Action copies it into every generated site together with Velvet's own
`LICENSE` file.

## Distributed browser code and assets

| Component | Version or source | License | Distribution |
| --- | --- | --- | --- |
| [Svelte](https://github.com/sveltejs/svelte/blob/svelte@5.56.8/LICENSE.md) | 5.56.8 | MIT | Runtime code is compiled into the browser JavaScript bundle. |
| [TypeBox](https://github.com/sinclairzx81/sinclair-typebox/blob/0.34.52/license) | 0.34.52 | MIT | Runtime validation code is compiled into the browser JavaScript bundle. |
| [`esm-env`](https://github.com/benmccann/esm-env/blob/main/LICENSE) | 1.2.2 | MIT | Environment flags are compiled into the browser JavaScript bundle through Svelte. |
| [Phosphor Core](https://github.com/phosphor-icons/core/blob/main/LICENSE) | 2.1.1 | MIT | Selected SVG data can be embedded in generated social images. |
| [Phosphor Web](https://github.com/phosphor-icons/web/blob/v2.1.2/LICENSE) | 2.1.2 | MIT | Icon CSS is compiled into the stylesheet, and the face is subset to the icons Velvet names and emitted as a woff2 file. |
| [Iconsax](https://docs.iconsax.io/license-and-terms/license) | Free Bulk icons via `iconsax` 0.1.1 | Iconsax Free Licence | Path data for the fourteen icons velvet.li draws is generated into `site/src/lib/iconsax.generated.ts` and compiled into the page. The licence permits redistribution only as part of code and forbids loose files, which is why no SVG is committed. Icons by Vuesax and Lusaxweb. |
| [Barlow](https://github.com/google/fonts/blob/main/ofl/barlow/OFL.txt) | Google Fonts v13 via `@fontsource/barlow` 5.3.0 | OFL-1.1 | Latin 400, 600, and 700 font files are bundled with browser onboarding. |
| [Barlow Condensed](https://github.com/google/fonts/blob/main/ofl/barlowcondensed/OFL.txt) | Google Fonts v13 via `@fontsource/barlow-condensed` 5.3.0 | OFL-1.1 | The Latin 600 font files are bundled with browser onboarding. |
| [Plaster](https://github.com/google/fonts/blob/main/ofl/plaster/OFL.txt) | `@fontsource/plaster` 5.3.0 | OFL-1.1 | Wordmark font files are bundled with Velvet browser tools. The wordmark on the onboarding backdrop is embedded as glyph outlines, recorded in `scripts/velvet-wordmark.json`. |
| [FCC logo](https://www.fcc.gov/sites/default/files/fcc-logo-black-2020.svg) | Retrieved 2026-08-01 | Work of the United States federal government, public domain | Path data is embedded in the onboarding backdrop as one of its compliance marks, recorded in `scripts/compliance-marks.json`. |
| [Conformité Européenne logo](https://commons.wikimedia.org/wiki/File:Conformit%C3%A9_Europ%C3%A9enne_(logo).svg) | Retrieved 2026-08-01 | Public domain | Path data is embedded in the onboarding backdrop, drawn to the geometry in Regulation 765/2008 Annex II and recorded in `scripts/compliance-marks.json`. |
| RoHS compliant mark | [iconlogovector.com](https://iconlogovector.com), retrieved 2026-08-01 | No terms stated by the provider | Path data is embedded in the onboarding backdrop, recorded in `scripts/compliance-marks.json`. RoHS is not an official mark, and a tick with the wording in a ring is the industry-conventional arrangement rather than a proprietary design. |
| [Inter](https://github.com/rsms/inter/blob/master/LICENSE.txt) | Google Fonts service | OFL-1.1 | Font files are loaded by the browser from Google Fonts and are not bundled by Velvet. |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt) | Google Fonts service | OFL-1.1 | Font files are loaded by the browser from Google Fonts and are not bundled by Velvet. |

The external font URL does not pin font-file versions; Google Fonts selects the
served files. The family licenses above still apply to those files. Browser
onboarding includes the complete Barlow, Barlow Condensed, and Plaster license
text as a linked build asset.

## Direct build, sync, and verification dependencies

These packages are installed from `bun.lock` on a development or
GitHub Actions runner. They are not copied into `velvet-dist`, except where a
separate distributed use is listed above.

| Package | Locked version | License |
| --- | --- | --- |
| `@eslint/js` | 10.0.1 | MIT |
| `@phosphor-icons/core` | 2.1.1 | MIT |
| `@phosphor-icons/web` | 2.1.2 | MIT |
| `@resvg/resvg-js` | 2.6.2 | MPL-2.0 |
| `@sinclair/typebox` | 0.34.52 | MIT |
| `@sveltejs/vite-plugin-svelte` | 5.1.1 | MIT |
| `@tsconfig/svelte` | 5.0.8 | MIT |
| `@types/bun` | 1.3.14 | MIT |
| `@types/js-yaml` | 4.0.9 | MIT |
| `@types/node` | 22.20.1 | MIT |
| `eslint` | 10.8.0 | MIT |
| `eslint-plugin-svelte` | 3.22.0 | MIT |
| `globals` | 17.8.0 | MIT |
| `js-yaml` | 4.3.0 | MIT |
| `playwright` | 1.62.0 | Apache-2.0 |
| `svelte` | 5.56.8 | MIT |
| `svelte-check` | 4.7.4 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `subset-font` | 2.5.0 | BSD-3-Clause |
| `typescript-eslint` | 8.65.0 | MIT |
| `vite` | 6.4.3 | MIT |

The complete locked tree was generated from `bun.lock` and manually
reviewed on 2026-08-03. It contains 230 external package entries: 174 MIT, 18
Apache-2.0, 13 MPL-2.0, 8 BSD-2-Clause, 7 ISC, 4 BSD-3-Clause, 3 OFL-1.1, 1
BlueOak-1.0.0, 1 Python-2.0, and 1 dual MIT and Zlib.
Every locked entry declares license metadata. Package license files installed
under `node_modules` remain the authoritative texts for build-only and
transitive dependencies.

[`actionlint` 1.7.12](https://github.com/rhysd/actionlint/blob/v1.7.12/LICENSE.txt)
is MIT-licensed and runs from its upstream container in GitHub Actions. The
container is not part of `bun.lock` and is not copied into Velvet outputs.

`js-yaml` is MIT-licensed. The installed notice is
[upstream](https://github.com/nodeca/js-yaml/blob/4.3.0/LICENSE).
`@resvg/resvg-js` and its platform packages are MPL-2.0-licensed. The installed
license is [upstream](https://github.com/thx/resvg-js/blob/v2.6.2/LICENSE).

## Required MIT notices for distributed components

### Svelte

Copyright (c) 2016-2025 [Svelte Contributors](https://github.com/sveltejs/svelte/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### TypeBox

Copyright (c) 2017-2026 Haydn Paterson

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### esm-env

Copyright 2022 Benjamin McCann

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Phosphor Core

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Phosphor Web

Copyright (c) 2020-2021 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
