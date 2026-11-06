# Vault Pulse

Obsidian community plugin. A month calendar and a GitHub-style activity heatmap, rendered in one sidebar `ItemView` above a shared day list.

## Quick reference

- Entry: `src/main.ts` → compiles to `main.js`
- Manifest id: `vault-pulse` (never rename — stable API for user data)
- Bundler: esbuild, target `es2018`, format `cjs`
- Tests: vitest with jsdom (`npm test`)
- Build: `npm run build` (typechecks + production bundle)

## Module responsibilities

| File | Responsibility |
|------|----------------|
| `src/main.ts` | Plugin lifecycle: `onload`, `registerView`, ribbon, commands, settings tab. **Sole vault-event subscriber** as of 0.3.0 — `metadataCache.changed` + `vault.create/modify/delete/rename` + `workspace.layout-change` all funnel through `refreshAll()` (debounced with `resetTimer`, so a burst scans once), which scans once, pushes to mounted views via `view.onDataChanged(scan)`, and renders the status bar widget. Caches parsed filter lists; invalidates on `saveSettings`. `onExternalSettingsChange` reloads a synced `data.json`; a 60 s interval re-scans when the local date changes. |
| `src/view.ts` | `VaultPulseView extends ItemView`. Owns the pane (calendar, heatmap, detail panel), the one selected day, the calendar's shown month, window pager state, tier-burst detection, lifetime-best maintenance. Receives data via `onDataChanged(scan)`. Every day pick goes through `selectDay`, which moves the calendar to the day's month and pages the heatmap only when the day is off its grid (`offsetForDay`). Render path is fingerprint-gated (`computeRenderKey` over data + the calendar's 42 visible days + the selected day's paths + selection + pager + shown month + visibility toggles + today's ISO) so identical-state refreshes return immediately. The calendar has its own structure key (shown month + week start), so a month change never rebuilds the heatmap. A section hidden by `effectiveVisibility` isn't rendered, and a hidden heatmap stays at pager offset 0. Hidden-pane gating (`pendingRender` flag flushed by `flushIfPending` on `layout-change`). The view subscribes to no vault or workspace events; it applies the color ramp on every data push, and theme changes reach it through CSS variables. Calendar clicks and arrow keys are delegated on the calendar container; event targets are checked with Obsidian's cross-window `instanceOf`. |
| `src/data.ts` | `buildVaultActivity` walks the vault ONCE and returns `{ windowed: ActivityMap, allActivity: Map<isoDate, count>, byDay: Map<isoDate, DayNotes> }` — windowed for the heatmap, unbounded for streak walks + mini stats, and `byDay` (created / modified notes per day, all time, ignoring `activitySource`, same-day notes only under created) for the calendar and the day list. `extractDates` takes the `modifiedDate` setting. `buildActivityMap` is a thin wrapper the tests use. `fingerprintActivity` covers every windowed and all-time day count for the view's render short-circuit. `parseFilters` materializes the filter strings (folder paths through `normalizePath`); pre-parsed filters can be passed back via `BuildOptions.filters` to skip per-scan parsing. |
| `src/renderer.ts` | Pure DOM build: CSS grid of heatmap cells, month/day labels, legend, sparkline, window pager controls. **`updateHeatmapCells` + `updateSparklineBars`** apply attribute-only diffs to existing nodes when the date structure is unchanged — used by `view.doRender()` instead of empty + rebuild for data-only changes. |
| `src/calendar.ts` | Month calendar DOM: `renderCalendar` builds nav, weekday header and 42 cells; `updateCalendarCells` sets dots (up to 3 per kind), `is-today` and the selected day's `aria-pressed` in place. Clicks are delegated to the view. |
| `src/calendarGrid.ts` | Pure: `calendarDays` (42 days for a month and week start), `clampPagerOffset`, `offsetForDay` (the pager offset whose rendered grid holds a day). |
| `src/detailPanel.ts` | Header (date + file count + streak icons + mini stats + Today button), the day's notes in Created and Modified groups (⌘/Ctrl-click opens a new tab via `Keymap.isModEvent`), trophy anniversaries menu. |
| `src/streakSymbols.ts` | Pure ladder: streak days → flame + trophy counts. |
| `src/streaks.ts` | `streakEndingAt` — the one streak walk (status bar, detail panel, carry-over). `computeCarryOverStreak` — yesterday's still-warm streak, fires only when today is empty and yesterday capped a ≥2-day run. Drives the muted-yellow chip / today-cell tint / status-bar flame so users see their previous streak before it falls out of the live counter. |
| `src/confetti.ts` | One-shot CSS-driven particle burst for tier crossings; `{ grand: true }` bumps piece count + gold palette for year-trophy moments. |
| `src/dateUtils.ts` | Luxon date math: window grid start, week/col indices, month label spans; localized `weekdayNames` and `dayCountLabel` ("Nov 4 · 3 files"). |
| `src/colorUtils.ts` | Quantile bucketing (p25/p50/p75), theme-aware color ramp. Auto builds the ramp in CSS from `--interactive-accent` (any color format); `level4` is also the calendar's fill accent, `onLevel4` readable text on it, and `accentTextLight` / `accentTextDark` the palette color for text and rings per theme mode (CSS picks by `.theme-dark`; each named palette clears 4.5:1, which a test checks). The view applies the ramp on every data push, ahead of the render-key check. |
| `src/elasticScroll.ts` | SwiftUI-tuned rubber-band scroll bounce at heatmap edges. |
| `src/interactions.ts` | Hover tooltip, click selection, arrow-key navigation. |
| `src/i18n/` | `en.json` + `t()` lookup + plural handling via `Intl.PluralRules`. Add a new locale as `<lang>.json` and register in `i18n/index.ts`. |
| `src/settings.ts` | `VaultPulseSettings` interface, defaults, `effectiveVisibility`, and the declarative `PluginSettingTab` (`getSettingDefinitions`, Obsidian 1.13+, so settings appear in settings search). `getControlValue` / `setControlValue` convert the numeric dropdowns, keep one section visible, and save through `plugin.saveSettings()`. |
| `src/types.ts` | Shared interfaces: `ActivityDay`, `ActivityMap`, `QuantileBuckets`, `ColorRamp`. |

## Conventions

- **Pure functions in `dateUtils`, `colorUtils`, `data`, `streakSymbols`, `i18n`** — testable without jsdom-on-obsidian.
- **Plugin owns vault events** — the view subscribes to none. New vault-event sources go in `main.ts` and route through `refreshAll()`.
- **Pop-out safe** — check DOM nodes with `node.instanceOf(X)`, not `instanceof X`, and schedule frames with `el.win.requestAnimationFrame`; a pane can live in another window.
- **Render path is fingerprint-gated.** Anything that would change what we draw belongs in `view.computeRenderKey()` so the short-circuit catches state changes correctly. Anything that changes which dates are in the grid belongs in `view.computeStructureKey()` so in-place updates fall back to a full rebuild when needed.
- **DOM lifecycle via `this.registerDomEvent`**, never `window.addEventListener`.
- **Obsidian event lifecycle via `this.registerEvent`**, never raw subscription.
- **Frontmatter via `metadataCache.getFileCache()`** only — never `vault.read()` (expensive, mobile-hostile).
- **Quantile buckets only** — never hardcoded count thresholds like `count > 5 → level 4`.
- **CSS grid of `<div>` cells** — never inline SVG. Icons go through `setIcon` (lucide).
- **All user-facing text routes through `t()`** — never inline English strings in view/settings code.
- **Safe DOM writes only** — `containerEl.createDiv` / `createSpan` / `createEl` for element creation (popout-window safe, inherits parent's window context). `textContent` / `addClass` / `removeClass` for mutation. Dynamic styles route through CSS variables via `el.style.setProperty('--name', value)` resolved by a class rule in `styles.css`; `setCssProps({ realProp: … })` and static `.style.x` assignments are flagged by `no-static-styles-assignment` (the heatmap's computed grid positions are the existing exception). `innerHTML` is forbidden. Reads off `document` use `activeDocument` instead.
- **No `backdrop-filter`** on persistent surfaces — it forces a compositor layer that bleeds across panes. Use `color-mix(...)` for translucency.
- **No generic state classes for new styling.** Themes restyle common classes globally (Dracula Official sets `.is-selected { background-color: … !important }`). Mark state with ARIA (`aria-pressed`) or a `vault-pulse-` class.
- **Style Settings variables are read, never declared, on the view.** Style Settings writes them on `body`; declaring them on `.vault-pulse-view` would shadow the user's value. Use `var(--vp-…-color, <theme fallback>)` at the point of use.
- **Sentence case** for every UI string — enforced by `npm run lint:obsidian`.
- **Obsidian handles view teardown** — do not call `detachLeavesOfType` in `onunload`.

## Lint + test before push

```bash
npm run lint:obsidian   # community directory scanner's rules, zero warnings (sentence case, no-static-styles, etc.)
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

Tag-triggered workflow at `.github/workflows/release.yml`. Pushing an `x.y.z` tag (e.g. `0.1.0`, not `v0.1.0`) that equals `manifest.json`'s version runs lint and tests, builds, attests, and attaches `main.js`, `manifest.json`, `styles.css` as individual assets. Tag the release branch before merging it; see CONTRIBUTING.md.

## References

- Developer policies: https://docs.obsidian.md/community-directory/developer-policies
- Submission requirements: https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- Pop-out windows: https://docs.obsidian.md/Plugins/Guides/Support+pop-out+windows
- Obsidian API: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
