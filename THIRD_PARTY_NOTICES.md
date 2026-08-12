# Third-party notices

This file records third-party components and assets used by Velvet. The status page Action copies it into every generated site together with Velvet's own `LICENSE` file.

## Distributed browser code and assets

| Component | Version | License | Distribution |
| --- | --- | --- | --- |
| [Svelte](https://github.com/sveltejs/svelte/blob/svelte@5.56.8/LICENSE.md) | 5.56.8 | MIT | Runtime code from `svelte` is compiled into the browser JavaScript bundle. |
| [TypeBox](https://github.com/sinclairzx81/sinclair-typebox/blob/0.34.52/license) | 0.34.52 | MIT | Runtime validation code from `@sinclair/typebox` is compiled into the browser JavaScript bundle. |
| [`esm-env`](https://github.com/benmccann/esm-env/blob/main/LICENSE) | 1.2.2 | MIT | Environment flags from `esm-env` are compiled into the browser JavaScript bundle through Svelte. |
| [Phosphor Core](https://github.com/phosphor-icons/core/blob/main/LICENSE) | 2.1.1 | MIT | Selected SVG data from `@phosphor-icons/core` can be embedded in generated social images. |
| [Phosphor Web](https://github.com/phosphor-icons/web/blob/v2.1.2/LICENSE) | 2.1.2 | MIT | Icon CSS from `@phosphor-icons/web` is compiled into the stylesheet, and the face is subset to the icons Velvet names and emitted as a woff2 file. |
| [Iconsax](https://docs.iconsax.io/license-and-terms/license) | 0.1.1 | Iconsax Free Licence | The free Bulk icons from `iconsax`. Path data for fourteen of them is generated into `site/src/lib/iconsax.generated.ts` and compiled into the page, and velvet.li draws four. The licence permits redistribution only as part of code and forbids loose files, which is why no SVG is committed. Icons by Vuesax and Lusaxweb. |
| [Datatype](https://github.com/google/fonts/blob/main/ofl/datatype/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin variable weight file is bundled with velvet.li, browser onboarding, and the Configurator, which all set their ordinary text in this face. |
| [Workbench](https://github.com/google/fonts/blob/main/ofl/workbench/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with velvet.li, browser onboarding, and the Configurator, which all set their headings in this face. |
| [Space Mono](https://github.com/google/fonts/blob/main/ofl/spacemono/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 700 font file is bundled with Velvet browser tools, which set every uppercase label in this face. |
| [Audiowide](https://github.com/google/fonts/blob/main/ofl/audiowide/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with velvet.li, which numbers the steps of its pipeline in this face. |
| [Plaster](https://github.com/google/fonts/blob/main/ofl/plaster/OFL.txt) | 5.3.0 | OFL-1.1 | Wordmark font files are bundled with Velvet browser tools and with every design a status page can be published in. The wordmark on the onboarding backdrop is embedded as glyph outlines, recorded in `scripts/velvet-wordmark.json`. The Velvet mark and the browser icon are drawn from the V of those same outlines. |
| [FCC logo](https://www.fcc.gov/sites/default/files/fcc-logo-black-2020.svg) | 2026-08-01 | Work of the United States federal government, public domain | Retrieved on the date given, which is the only thing that fixes which drawing this is. Path data is embedded in the onboarding backdrop as one of its compliance marks, recorded in `scripts/compliance-marks.json`. |
| [Conformité Européenne logo](https://commons.wikimedia.org/wiki/File:Conformit%C3%A9_Europ%C3%A9enne_(logo).svg) | 2026-08-01 | Public domain | Retrieved on the date given. Path data is embedded in the onboarding backdrop, drawn to the geometry in Regulation 765/2008 Annex II and recorded in `scripts/compliance-marks.json`. |
| [RoHS compliant mark](https://iconlogovector.com) | 2026-08-01 | No terms stated by the provider | Retrieved on the date given from iconlogovector.com. Path data is embedded in the onboarding backdrop, recorded in `scripts/compliance-marks.json`. RoHS is not an official mark, and a tick with the wording in a ring is the industry-conventional arrangement rather than a proprietary design. |
| [Inter](https://github.com/rsms/inter/blob/master/LICENSE.txt) | 5.3.0 | OFL-1.1 | Latin 400, 500, 600 and 700 font files are bundled with the Velvet design. |
| [Doto](https://github.com/google/fonts/blob/main/ofl/doto/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 400, 600 and 700 font files are bundled with the Cassette design, and the Latin 600 file with Velvet browser tools. They print a value in this face, and velvet.li sets every word of code in it as well, in a block and inside a sentence alike. |
| [IBM Plex Mono](https://github.com/IBM/plex/blob/master/LICENSE.txt) | 5.3.0 | OFL-1.1 | Latin 400, 500, 600 and 400 italic font files are bundled with the Cassette design. |
| [Monoton](https://github.com/google/fonts/blob/main/ofl/monoton/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with the Cassette design. |
| [Tangerine](https://github.com/google/fonts/blob/main/ofl/tangerine/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 400 and 700 font files are bundled with the Cassette design. |
| [Rajdhani](https://github.com/google/fonts/blob/main/ofl/rajdhani/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 300, 400, 500, 600 and 700 font files are bundled with the Twenty Forty-Nine design. |
| [Share Tech Mono](https://github.com/google/fonts/blob/main/ofl/sharetechmono/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with the Twenty Forty-Nine design. |
| [Antonio](https://github.com/google/fonts/blob/main/ofl/antonio/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 400, 600 and 700 font files are bundled with the NCC-1701-D design. |
| [Jura](https://github.com/google/fonts/blob/main/ofl/jura/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 400, 500, 600 and 700 font files are bundled with the NCC-1701-D design. |
| [Fira Code](https://github.com/tonsky/FiraCode/blob/master/LICENSE) | 5.3.0 | OFL-1.1 | Font files are bundled with every Velvet surface and with a published status page. A status page and the Configurator set in this face every value a reader takes a reading from: an axis, a response time, a protocol, the serial at the foot of a page. |

Every design a status page can be published in carries the faces it names, together with the complete licence text of each one, in its own `assets/fonts/` directory. Browser onboarding includes the complete Datatype, Workbench, Space Mono, Audiowide, Doto, and Plaster licence text as a linked build asset.

## Required MIT notices for distributed components

### Svelte

Copyright (c) 2016-2025 [Svelte Contributors](https://github.com/sveltejs/svelte/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### TypeBox

Copyright (c) 2017-2026 Haydn Paterson

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### esm-env

Copyright 2022 Benjamin McCann

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Phosphor Core

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Phosphor Web

Copyright (c) 2020-2021 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
