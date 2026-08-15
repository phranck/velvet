# Third-party notices

This file records third-party components and assets used by Velvet. The status page Action copies it into every generated site together with Velvet's own `LICENSE` file.

## Distributed browser code and assets

| Component | Version | License | Distribution |
| --- | --- | --- | --- |
| [Svelte](https://github.com/sveltejs/svelte/blob/svelte@5.56.8/LICENSE.md) | 5.56.8 | MIT | Runtime code from `svelte` is compiled into the browser JavaScript bundle. |
| [TypeBox](https://github.com/sinclairzx81/sinclair-typebox/blob/0.34.52/license) | 0.34.52 | MIT | Runtime validation code from `@sinclair/typebox` is compiled into the browser JavaScript bundle. |
| [`esm-env`](https://github.com/benmccann/esm-env/blob/main/LICENSE) | 1.2.2 | MIT | Environment flags from `esm-env` are compiled into the browser JavaScript bundle through Svelte. |
| [`bits-ui`](https://github.com/huntabyte/bits-ui/blob/main/LICENSE) | 2.18.1 | MIT | Component behaviour from `bits-ui` is compiled into the configurator's browser bundle. It supplies keyboard navigation, focus handling, and ARIA state; every rule that draws these controls is Velvet's own. |
| [`svelte-toolbelt`](https://github.com/svecosystem/svelte-toolbelt/blob/main/LICENSE) | 0.10.6 | MIT | Reactive helpers `bits-ui` is built on, compiled into the configurator's browser bundle through it. |
| [`runed`](https://github.com/svecosystem/runed/blob/main/LICENSE) | 0.35.1 | MIT | Reactive utilities `bits-ui` is built on, compiled into the configurator's browser bundle through it. |
| [`clsx`](https://github.com/lukeed/clsx/blob/master/license) | 2.1.1 | MIT | Class-name composition used by `bits-ui`, compiled into the configurator's browser bundle through it. |
| [`style-to-object`](https://github.com/remarkablemark/style-to-object/blob/master/LICENSE) | 1.0.14 | MIT | Style parsing used by `bits-ui`, compiled into the configurator's browser bundle through it. |
| [`inline-style-parser`](https://github.com/remarkablemark/inline-style-parser/blob/master/LICENSE) | 0.2.7 | MIT | Style parsing used by `style-to-object`, compiled into the configurator's browser bundle through it. |
| [Phosphor Core](https://github.com/phosphor-icons/core/blob/main/LICENSE) | 2.1.1 | MIT | Selected SVG data from `@phosphor-icons/core` can be embedded in generated social images. |
| [Phosphor Web](https://github.com/phosphor-icons/web/blob/v2.1.2/LICENSE) | 2.1.2 | MIT | Icon CSS from `@phosphor-icons/web` is compiled into the stylesheet, and the face is subset to the icons Velvet names and emitted as a woff2 file. |
| [Iconsax](https://docs.iconsax.io/license-and-terms/license) | 0.1.1 | Iconsax Free Licence | The free Bulk icons from `iconsax`. Path data for fourteen of them is generated into `site/src/lib/iconsax.generated.ts` and compiled into the page, and velvet.li draws four. The licence permits redistribution only as part of code and forbids loose files, which is why no SVG is committed. Icons by Vuesax and Lusaxweb. |
| [Datatype](https://github.com/google/fonts/blob/main/ofl/datatype/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin variable weight file is bundled with velvet.li and browser onboarding, which both set their ordinary text in this face. |
| [Workbench](https://github.com/google/fonts/blob/main/ofl/workbench/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with velvet.li and browser onboarding, which both set their headings in this face. |
| [Space Mono](https://github.com/google/fonts/blob/main/ofl/spacemono/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 700 font file is bundled with Velvet browser tools, which set every uppercase label in this face. |
| [Audiowide](https://github.com/google/fonts/blob/main/ofl/audiowide/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with velvet.li, which numbers the steps of its pipeline in this face. |
| [Plaster](https://github.com/google/fonts/blob/main/ofl/plaster/OFL.txt) | 5.3.0 | OFL-1.1 | Wordmark font files are bundled with Velvet browser tools and with every design a status page can be published in. The word is also recorded as glyph outlines in `scripts/velvet-wordmark.json`, and the Velvet mark and the browser icon are drawn from the V of those outlines. |
| [Inter](https://github.com/rsms/inter/blob/master/LICENSE.txt) | 5.3.0 | OFL-1.1 | Latin 400, 500, 600 and 700 font files are bundled with the Velvet design. |
| [Doto](https://github.com/google/fonts/blob/main/ofl/doto/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 400, 600 and 700 font files are bundled with the Retro Chassis design, and the Latin 600 file with Velvet browser tools. They print a value in this face, and velvet.li sets every word of code in it as well, in a block and inside a sentence alike. |
| [IBM Plex Mono](https://github.com/IBM/plex/blob/master/LICENSE.txt) | 5.3.0 | OFL-1.1 | Latin 400, 500, 600 and 400 italic font files are bundled with the Retro Chassis design. |
| [Monoton](https://github.com/google/fonts/blob/main/ofl/monoton/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with the Retro Chassis design. |
| [Atomic Age](https://github.com/google/fonts/blob/main/ofl/atomicage/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with the Retro Chassis design. |
| [Rajdhani](https://github.com/google/fonts/blob/main/ofl/rajdhani/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 300, 400, 500, 600 and 700 font files are bundled with the Twenty Forty-Nine design. |
| [Share Tech Mono](https://github.com/google/fonts/blob/main/ofl/sharetechmono/OFL.txt) | 5.3.0 | OFL-1.1 | The Latin 400 font file is bundled with the Twenty Forty-Nine design. |
| [Antonio](https://github.com/google/fonts/blob/main/ofl/antonio/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 400, 600 and 700 font files are bundled with the NCC-1701-D design. |
| [Jura](https://github.com/google/fonts/blob/main/ofl/jura/OFL.txt) | 5.3.0 | OFL-1.1 | Latin 400, 500, 600 and 700 font files are bundled with the NCC-1701-D design. |
| [Fira Code](https://github.com/tonsky/FiraCode/blob/master/LICENSE) | 5.3.0 | OFL-1.1 | Font files are bundled with every Velvet surface and with a published status page. A status page sets in this face every value a reader takes a reading from: an axis, a response time, a protocol, the serial at the foot of a page. |

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

### bits-ui

Copyright (c) 2023 Hunter Johnston

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### svelte-toolbelt

Copyright (c) 2024 Hunter Johnston

Copyright (c) 2024 Thomas G. Lopes

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### runed

Copyright (c) 2024 Hunter Johnston

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### clsx

Copyright (c) Luke Edwards

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### style-to-object

Copyright (c) 2017 Menglin "Mark" Xu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### inline-style-parser

Copyright (c) 2012 TJ Holowaychuk

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
