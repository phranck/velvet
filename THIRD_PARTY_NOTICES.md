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
| [Phosphor Web](https://github.com/phosphor-icons/web/blob/v2.1.2/LICENSE) | 2.1.2 | MIT | Icon CSS and fonts are loaded by the browser from unpkg. |
| [Inter](https://github.com/rsms/inter/blob/master/LICENSE.txt) | Google Fonts service | OFL-1.1 | Font files are loaded by the browser from Google Fonts and are not bundled by Velvet. |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt) | Google Fonts service | OFL-1.1 | Font files are loaded by the browser from Google Fonts and are not bundled by Velvet. |

The external font URL does not pin font-file versions; Google Fonts selects the
served files. The family licenses above still apply to those files.

## Direct build, sync, and verification dependencies

These packages are installed from `package-lock.json` on a development or
GitHub Actions runner. They are not copied into `velvet-dist`, except where a
separate distributed use is listed above.

| Package | Locked version | License |
| --- | --- | --- |
| `@phosphor-icons/core` | 2.1.1 | MIT |
| `@resvg/resvg-js` | 2.6.2 | MPL-2.0 |
| `@sinclair/typebox` | 0.34.52 | MIT |
| `@sveltejs/vite-plugin-svelte` | 5.1.1 | MIT |
| `@tsconfig/svelte` | 5.0.8 | MIT |
| `@types/js-yaml` | 4.0.9 | MIT |
| `@types/node` | 22.20.1 | MIT |
| `js-yaml` | 4.3.0 | MIT |
| `playwright` | 1.62.0 | Apache-2.0 |
| `svelte` | 5.56.8 | MIT |
| `svelte-check` | 4.7.3 | MIT |
| `tsx` | 4.23.1 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `vite` | 6.4.3 | MIT |

The complete locked tree was generated from `package-lock.json` and manually
reviewed on 2026-07-27. It contains 149 external package entries: 128 MIT, 13
MPL-2.0, 5 Apache-2.0, 1 BSD-3-Clause, 1 ISC, and 1 Python-2.0. Every locked
entry declares license metadata. Package license files installed under
`node_modules` remain the authoritative texts for build-only and transitive
dependencies.

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
