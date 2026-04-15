# Vault Pulse

Obsidian community plugin. GitHub-style activity heatmap rendered in a sidebar `ItemView`.

## Quick reference

- Entry: `src/main.ts` → compiles to `main.js`
- Manifest id: `vault-pulse` (never rename — stable API for user data)
- Bundler: esbuild, target `es2018`, format `cjs`
- Tests: vitest with jsdom (`npm test`)
- Build: `npm run build` (typechecks + production bundle)

## Module responsibilities

| File | Responsibility |
|------|----------------|
| `src/main.ts` | Plugin lifecycle: `onload`, `registerView`, ribbon, commands, settings tab, status bar widget (plugin-level event subscriptions keep it fresh independent of the view). |
| `src/view.ts` | `VaultPulseView extends ItemView`. Owns the pane, subscribes to events, window pager state, tier-burst detection, lifetime-best maintenance. |
| `src/data.ts` | Scan vault: `buildActivityMap` returns the windowed `Map<isoDate, TFile[]>` for rendering; `buildAllActivity` returns the unbounded `Map<isoDate, count>` for streak walks + mini stats. |
| `src/renderer.ts` | Pure DOM build: CSS grid of heatmap cells, month/day labels, legend, sparkline, window pager controls. |
| `src/detailPanel.ts` | Header (date + file count + streak icons + mini stats + Today button), file list, trophy anniversaries menu. |
| `src/streakSymbols.ts` | Pure ladder: streak days → flame + trophy counts. |
| `src/confetti.ts` | One-shot CSS-driven particle burst for tier crossings; `{ grand: true }` bumps piece count + gold palette for year-trophy moments. |
| `src/dateUtils.ts` | Luxon date math: window grid start, week/col indices, month label spans. |
| `src/colorUtils.ts` | Quantile bucketing (p25/p50/p75), theme-aware color ramp. |
| `src/elasticScroll.ts` | SwiftUI-tuned rubber-band scroll bounce at heatmap edges. |
| `src/interactions.ts` | Hover tooltip, click selection, arrow-key navigation. |
| `src/i18n/` | `en.json` + `t()` lookup + plural handling via `Intl.PluralRules`. Add a new locale as `<lang>.json` and register in `i18n/index.ts`. |
| `src/settings.ts` | `VaultPulseSettings` interface, defaults, `PluginSettingTab`. |
| `src/types.ts` | Shared interfaces: `ActivityDay`, `ActivityMap`, `QuantileBuckets`, `ColorRamp`. |

## Conventions

- **Pure functions in `dateUtils`, `colorUtils`, `data`, `streakSymbols`, `i18n`** — testable without jsdom-on-obsidian.
- **DOM lifecycle via `this.registerDomEvent`**, never `window.addEventListener`.
- **Obsidian event lifecycle via `this.registerEvent`**, never raw subscription.
- **Frontmatter via `metadataCache.getFileCache()`** only — never `vault.read()` (expensive, mobile-hostile).
- **Quantile buckets only** — never hardcoded count thresholds like `count > 5 → level 4`.
- **CSS grid of `<div>` cells** — never inline SVG. Icons go through `setIcon` (lucide).
- **All user-facing text routes through `t()`** — never inline English strings in view/settings code.
- **Safe DOM writes only** — `textContent` / `setCssProps` / `addClass` / `removeClass`. No `innerHTML`, no direct `.style.x = "literal"` assignments (dynamic grid positions are the only exception, scoped to `renderer.ts`).
- **Sentence case** for every UI string — enforced by `npm run lint:obsidian`.
- **Obsidian handles view teardown** — do not call `detachLeavesOfType` in `onunload`.

## Lint + test before push

```bash
npm run lint:obsidian   # ObsidianReviewBot rules (sentence case, no-static-styles, etc.)
npm test                # vitest suite
npm run build           # tsc + esbuild
```

## Testing

```bash
npm test            # run once
npm run test:watch  # watch mode
```

Tests live under `tests/` and alias the `obsidian` module to `tests/__mocks__/obsidian.ts`.

## Release

Tag-triggered workflow at `.github/workflows/release.yml`. Pushing a semver tag (e.g. `0.1.0`, not `v0.1.0`) builds and attaches `main.js`, `manifest.json`, `styles.css` as individual assets.

## References

- Obsidian API: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
