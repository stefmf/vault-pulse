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
| `src/main.ts` | Plugin lifecycle: `onload`, `registerView`, ribbon, commands, settings tab. |
| `src/view.ts` | `VaultPulseView extends ItemView`. Owns the pane, subscribes to events. |
| `src/data.ts` | Scan vault, extract created/updated from frontmatter or stat, build `Map<isoDate, TFile[]>`. |
| `src/renderer.ts` | Pure DOM build: CSS grid of cells, month/day labels. |
| `src/dateUtils.ts` | Luxon date math: last-365 window, grid-start, week/col indices, month label spans. |
| `src/colorUtils.ts` | Quantile bucketing (p25/p50/p75), theme-aware color ramp. |
| `src/interactions.ts` | Hover tooltip, click popover, dismiss via outside-click and ESC. |
| `src/settings.ts` | `VaultPulseSettings` interface, defaults, `PluginSettingTab`. |
| `src/types.ts` | Shared interfaces: `ActivityDay`, `ActivityMap`, `QuantileBuckets`. |

## Conventions

- **Pure functions in `dateUtils`, `colorUtils`, `data`** — testable without jsdom-on-obsidian.
- **DOM lifecycle via `this.registerDomEvent`**, never `window.addEventListener`.
- **Obsidian event lifecycle via `this.registerEvent`**, never raw subscription.
- **Frontmatter via `metadataCache.getFileCache()`** only — never `vault.read()` (expensive, mobile-hostile).
- **Quantile buckets only** — never hardcoded count thresholds like `count > 5 → level 4`.
- **CSS grid of `<div>` cells** — never inline SVG.
- **Obsidian handles view teardown** — do not call `detachLeavesOfType` in `onunload`.

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
