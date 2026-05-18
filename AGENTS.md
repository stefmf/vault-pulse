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
| `src/main.ts` | Plugin lifecycle: `onload`, `registerView`, ribbon, commands, settings tab. **Sole vault-event subscriber** as of 0.3.0 — `metadataCache.changed` + `vault.create/modify/delete/rename` + `workspace.layout-change` all funnel through `refreshAll()`, which scans once, pushes to mounted views via `view.onDataChanged(scan)`, and renders the status bar widget. Caches parsed filter lists; invalidates on `saveSettings`. |
| `src/view.ts` | `VaultPulseView extends ItemView`. Owns the pane, window pager state, tier-burst detection, lifetime-best maintenance. Receives data via `onDataChanged(scan)`. Render path is fingerprint-gated (`computeRenderKey` over data + selection + pager + visibility toggles + today's ISO) so identical-state refreshes return immediately. Hidden-pane gating (`pendingRender` flag flushed by `flushIfPending` on `layout-change`). The only event the view subscribes to directly is `workspace.css-change`, which re-applies the color ramp without rebuilding any DOM. |
| `src/data.ts` | `buildVaultActivity` walks the vault ONCE and returns `{ windowed: ActivityMap, allActivity: Map<isoDate, count> }` — windowed for the heatmap, unbounded for streak walks + mini stats. `buildActivityMap` / `buildAllActivity` remain as thin wrappers. `fingerprintActivity` produces the lightweight content hash used by the view's render short-circuit. `parseFilters` materializes the filter strings; pre-parsed filters can be passed back via `BuildOptions.filters` to skip per-scan parsing. |
| `src/renderer.ts` | Pure DOM build: CSS grid of heatmap cells, month/day labels, legend, sparkline, window pager controls. **`updateHeatmapCells` + `updateSparklineBars`** apply attribute-only diffs to existing nodes when the date structure is unchanged — used by `view.doRender()` instead of empty + rebuild for data-only changes. |
| `src/detailPanel.ts` | Header (date + file count + streak icons + mini stats + Today button), file list, trophy anniversaries menu. |
| `src/streakSymbols.ts` | Pure ladder: streak days → flame + trophy counts. |
| `src/streaks.ts` | `computeCarryOverStreak` — yesterday's still-warm streak, fires only when today is empty and yesterday capped a ≥2-day run. Drives the muted-yellow chip / today-cell tint / status-bar flame so users see their previous streak before it falls out of the live counter. |
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
- **Plugin owns vault events** — view subscribes ONLY to `workspace.css-change`. New vault-event sources go in `main.ts` and route through `refreshAll()`.
- **Render path is fingerprint-gated.** Anything that would change what we draw belongs in `view.computeRenderKey()` so the short-circuit catches state changes correctly. Anything that changes which dates are in the grid belongs in `view.computeStructureKey()` so in-place updates fall back to a full rebuild when needed.
- **DOM lifecycle via `this.registerDomEvent`**, never `window.addEventListener`.
- **Obsidian event lifecycle via `this.registerEvent`**, never raw subscription.
- **Frontmatter via `metadataCache.getFileCache()`** only — never `vault.read()` (expensive, mobile-hostile).
- **Quantile buckets only** — never hardcoded count thresholds like `count > 5 → level 4`.
- **CSS grid of `<div>` cells** — never inline SVG. Icons go through `setIcon` (lucide).
- **All user-facing text routes through `t()`** — never inline English strings in view/settings code.
- **Safe DOM writes only** — `containerEl.createDiv` / `createSpan` / `createEl` for element creation (popout-window safe, inherits parent's window context). `textContent` / `addClass` / `removeClass` for mutation. Dynamic styles route through CSS variables via `el.style.setProperty('--name', value)` resolved by a class rule in `styles.css` — direct `.style.x` and `setCssProps({ realProp: … })` are flagged by `no-static-styles-assignment`. `innerHTML` is forbidden. Reads off `document` use `activeDocument` instead.
- **No `backdrop-filter`** on persistent surfaces — it forces a compositor layer that bleeds across panes. Use `color-mix(...)` for translucency.
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
