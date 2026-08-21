# Developing Velvet

Velvet pins Bun 1.3.14 as both its package manager and its runtime. The pin lives in `packageManager` in the root `package.json`, and every other place reads it from there rather than naming a version of its own.

| Environment | Supported path |
| --- | --- |
| Local macOS | Bun 1.3.14 on Apple Silicon or Intel |
| Linux CI | `oven-sh/setup-bun@v2` reading the root `packageManager` pin |
| Playwright | Chromium installed through `bunx --bun playwright` |
| Composite Actions | `oven-sh/setup-bun@v2` with Bun 1.3.14 pinned explicitly |

## The gates

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
```

`bun run check` runs those four in that order.

`bun run test` includes the browser suite. `bun run test:headless` is everything that needs no browser, and it is the faster gate to reach for whilst working.

## Built browser applications are committed

`config/` and `onboarding/` hold built browser applications and are part of the repository. CI fails when `git diff` reports anything after `bun run build`, so run the root build before pushing rather than one application's own script. Both applications read `src/lib/`, so a change there reaches both, and rebuilding only the one you were working in leaves the other stale.

## Themes

A status page is published in a theme, and one stylesheet decides its colour, typography, shape, arrangement, and motion whilst the markup stays the same. [theme-authoring.md](theme-authoring.md) is the manual for that layer and the source of truth for anything about it.

Two gates cover it. `bun run --cwd site themes:verify` checks that a theme is self-contained and fails in about a second. `bun run --cwd site themes:conform` then drives every theme against every fixture.

## Releases

[releasing.md](releasing.md) covers how a release is cut and what each step guarantees.
