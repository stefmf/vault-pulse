# Vault Pulse

A GitHub-style activity heatmap for Obsidian. Renders a 53×7 grid of the last 365 days in a sidebar pane, so you can see your writing cadence at a glance — then click any day to see the exact files you touched.

| Green | Heat | Sunset |
|:-----:|:----:|:------:|
| ![Green palette, light theme](docs/palette-green-light.png) | ![Heat palette, light theme](docs/palette-heat-light.png) | ![Sunset palette, light theme](docs/palette-sunset-light.png) |
| ![Green palette, dark theme](docs/palette-green-dark.png) | ![Heat palette, dark theme](docs/palette-heat-dark.png) | ![Sunset palette, dark theme](docs/palette-sunset-dark.png) |

_Three of the built-in palettes, in light and dark themes._ Auto (theme accent) and Custom (any hex) round out the five options.

## Features

- **Sidebar pane** — lives in the right sidebar, collapses like any other panel.
- **Configurable window** — 90 / 180 / 365 day heatmap; today anchored bottom-right, today's cell always outlined.
- **Quantile-based colors** — buckets adapt to your vault size; no hardcoded thresholds.
- **Five color palettes** — Auto (theme accent), Green (GitHub-style), **Heat** (orange → red), **Sunset** (gold → indigo), or Custom hex.
- **Recent-30 sparkline** — compact bar chart above the legend showing the last 30 days, independent of how far you've scrolled the main grid.
- **Detail panel** — click any day and the panel below lists the files for that day, each clickable, each ⌘-hover previewable.
- **Folder / tag filters** — exclude noisy folders (e.g. `Archive`) or restrict to files carrying specific tags.
- **Streak milestones** — lucide 🔥 flame icons at 7 / 30 / 100 days, plus a 🏆 trophy at the 1-year mark. Click the trophy to see the year-1 date.
- **Lifetime best** — remembers your longest-ever streak so you can chase it after a break; flashes gold when you tie or beat it.
- **Visibility toggles** — turn the sparkline and streak counter on or off independently.
- **Style Settings support** — exposes the flame and trophy colors as editable variables when the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin is installed.
- **Localized** — all user-facing strings route through `src/i18n/` with English shipping today and community-contributed locales welcome.
- **Jump to today** — command palette entry, plus a "Today →" button in the detail header when you've scrolled away.
- **Keyboard navigation** — Tab into the grid, then ←/→ = ±week, ↑/↓ = ±day; the detail panel updates as you move.
- **Apple-style scroll bounce** — mass-spring-damper physics tuned to SwiftUI's default feel (`response=0.55s`, `dampingFraction=0.825`).
- **Theme-aware** — colors follow your Obsidian theme and re-render on theme switch.
- **Auto-updates** — edits, creates, deletes, and renames re-render within ~200ms (debounced).
- **Mobile-compatible** — no Node / Electron APIs; `isDesktopOnly: false`.
- **Reduced-motion friendly** — every animation and the scroll bounce disable when the OS has Reduce Motion enabled.

## Install

### From the community plugin store

*Coming soon.* Once accepted you'll be able to install from **Settings → Community plugins → Browse → search "Vault Pulse"**.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/stefmf/vault-pulse/releases).
2. Copy them into `<YourVault>/.obsidian/plugins/vault-pulse/` (create the folder if it doesn't exist).
3. In Obsidian: **Settings → Community plugins**, enable **Vault Pulse**.

### Build from source

```bash
git clone https://github.com/stefmf/vault-pulse.git
cd vault-pulse
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<YourVault>/.obsidian/plugins/vault-pulse/`, or use `npm run seed` (see Development) which sets up a throwaway vault with the plugin pre-installed.

## Usage

Open the heatmap via the **grid** ribbon icon (left sidebar) or the command palette entry **Vault Pulse: Open heatmap**.

- **Hover** a cell → tooltip: `Mon DD · N files`.
- **Click** a cell → detail panel shows the file list for that day; click a file row to open it.
- **⌘-hover** (macOS) / **Ctrl-hover** (Windows/Linux) a file row → Obsidian's native note preview popover.
- **Tab** into the grid, then **arrow keys** to move: ←/→ = prev/next week, ↑/↓ = prev/next day.
- **Esc** or **click outside** the pane closes nothing — the detail panel is always visible.
- Run **Vault Pulse: Jump to today** (⌘P) or click the **Today →** button in the detail header to scroll back and re-select today.

## Settings

| Setting | Options | Notes |
|---------|---------|-------|
| **Activity source** | Combined / Modified / Created | Default: Combined. A file counts for a day if **either** created OR updated matches that day. |
| **Color palette** | Auto · Green · Heat · Sunset · Custom hex | Auto follows `--interactive-accent`. Named palettes use discrete hex values tuned for both light and dark themes. |
| **Custom hex color** | `#RRGGBB` | Only visible when palette is "Custom". |
| **Window length** | 90 / 180 / 365 days | Default: 365. Shorter windows narrow the grid but bring recent activity into sharper view. |
| **Week starts on** | Sunday / Monday | Default: Sunday (matches GitHub). |
| **Exclude folders** | Comma-separated path prefixes | e.g. `Archive, _templates`. Prefix matching: `Archive` excludes `Archive/...` but not `My-Archive/...`. Empty = include all. |
| **Include tags** | Comma-separated tag names (leading `#` optional) | e.g. `project, journal`. If set, files must have AT LEAST ONE of these tags. Empty = include all. Reads both frontmatter `tags:` and inline `#tags`. |
| **Show sparkline** | On / Off | Default: On. Toggles the 30-day bar chart above the legend. |
| **Show streak counter** | On / Off | Default: On. Toggles the flame / trophy milestone row in the detail header. |
| **Show mini stats** | On / Off | Default: On. Toggles the week / month / year file counts under the streak row. |
| **Show status bar widget** | On / Off | Default: On. Toggles the streak + today's-files summary in Obsidian's status bar. |

## Streaks

Vault Pulse tracks consecutive active days across your whole vault (not capped to the window) and rewards consistency with a small milestone ladder:

| Day | Milestone |
|-----|-----------|
| 7 | 🔥 first flame |
| 30 | 🔥🔥 second flame |
| 100 | 🔥🔥🔥 third flame |
| 365 | 🔥🔥🔥 🏆 trophy (grand celebration — gold confetti + bigger ripple) |

Additional:

- **Lifetime best** — `· best N` renders next to the current streak and persists across broken streaks. Flashes gold on ties / new records.
- **Window pager** — `◀ [range] ▶` above the heatmap steps backward through history one window at a time. Disabled when no older activity remains or when the grid ends on today. Reusing the existing **Today →** button returns you home in one click and resets the offset.
- **Status bar widget** — `🔥 N · [file] M` in Obsidian's status bar shows the current streak (once it's ≥ 7 days) and today's file count. Clicking it opens the pane.
- **Mini stats** — under the streak row, `N WEEK · M MONTH · K YEAR` gives at-a-glance velocity (last 7 days / calendar month / calendar year).
- **Tier crossings** fire a short ripple + CSS confetti burst; the year-trophy crossover uses a gold-weighted palette with extra pieces and a larger ripple. Everything respects `prefers-reduced-motion`.

### Frontmatter dates

Vault Pulse reads `created` and `updated` from each note's frontmatter when present. Supported formats: ISO 8601 (`2026-04-13`, `2026-04-13T12:34:56`), SQL (`2026-04-13 12:34:56`), JS Date objects, and Unix millisecond epochs. Missing frontmatter falls back to the file's filesystem stat (`ctime` / `mtime`).

## How the colors work

Activity levels use quantile bucketing over the **non-zero days** in the 365-day window:

| Level | Condition |
|-------|-----------|
| 0 | count = 0 (theme border color) |
| 1 | `count ≤ p25` |
| 2 | `p25 < count ≤ p50` |
| 3 | `p50 < count ≤ p75` |
| 4 | `count > p75` |

This adapts automatically: a light vault with ~1 note/day and a heavy vault with dozens/day both end up with meaningful bucketing. For the Auto and Custom palettes the colors are computed as alpha-blends of your base color, so empty days show through the theme background. For Green, Heat, and Sunset, the four levels are pre-tuned discrete hex values.

## Development

```bash
npm install
npm run dev              # esbuild watch mode
npm test                 # vitest suite — pure function coverage
npm run lint:obsidian    # run the ObsidianReviewBot eslint rules locally
npm run seed             # seeds ./test-vault/ with 50 fake notes across ~90 days
npm run sync             # copies main.js/manifest.json/styles.css into test-vault plugin folder
npm run build            # type-check + production bundle
```

### Test vault

`npm run seed` generates `./test-vault/` with frontmatter-dated notes, creates `.obsidian/plugins/vault-pulse/`, and copies the built files in. Open that folder as a vault in Obsidian to iterate. Re-run `npm run build && npm run sync` after code changes and reload Obsidian (⌘R) to pick them up.

**Targeted seeding** — the seed script accepts CLI flags so you can exercise any streak state without waiting for real calendar time:

```bash
npm run seed -- --clean                     # wipe .md, keep plugin install
npm run seed -- --tier=week                 # 7-day streak ending today
npm run seed -- --tier=month                # 30-day streak
npm run seed -- --tier=hundred              # 100-day streak
npm run seed -- --tier=year                 # 365-day streak (first trophy)
npm run seed -- --trophies=2                # 731-day streak (two trophies)
npm run seed -- --streak=30 --pre=10        # streak + prior activity with a gap
npm run seed -- --streak=15 --per-day=1-4   # 1..4 notes per day (quantile variety)
npm run seed -- --streak=15 --tags=project  # tag-filter testing
npm run seed -- --streak=15 --in-folder=Archive   # folder-filter testing
```

### Contributing translations

All user-facing strings live in [`src/i18n/en.json`](src/i18n/en.json). To add a locale:

1. Copy `en.json` to `<lang>.json` (e.g. `de.json`, `fr.json`).
2. Translate the string values — don't rename keys or change the `{placeholders}`.
3. Register the new bundle in [`src/i18n/index.ts`](src/i18n/index.ts) (import it and add to `LOCALES`).
4. Open a PR. Obsidian's `moment.locale()` auto-picks the right bundle for each user.

Plural-sensitive strings use an `Intl.PluralRules`-driven naming convention — see the `files_one` / `files_other` pair in `en.json`. Languages with more than two plural forms can provide `_zero`, `_two`, `_few`, `_many` alongside `_other` and the renderer will pick the right one.

### Project layout

```
src/
  main.ts            Plugin lifecycle, registerView, ribbon, commands, hover-link source
  view.ts            ItemView subclass, refresh orchestration, streak walk, trail + tier burst
  renderer.ts        Pure DOM build (CSS grid of divs, legend, month labels, sparkline)
  detailPanel.ts     Detail panel (date header, streak milestones, Today button, file rows, anniversaries menu)
  data.ts            Vault scan → Map<isoDate, TFile[]>
  dateUtils.ts       Luxon date math (grid start, week/col indices, month labels)
  colorUtils.ts      Quantile buckets + palette dispatch (discrete + alpha-blend)
  streakSymbols.ts   Pure ladder logic (flames + trophies → display string)
  interactions.ts    Hover tooltip, click selection, arrow-key navigation
  elasticScroll.ts   Apple-style mass-spring-damper scroll bounce
  confetti.ts        CSS-driven particle burst for tier crossings
  i18n/              Localization bundles + t() helper
  settings.ts        Settings interface, defaults, PluginSettingTab
  types.ts           Shared interfaces
tests/               vitest suites for the pure modules
scripts/
  seed-vault.mjs     Seeds test-vault/ with 50 notes + installs built plugin
  sync-plugin.mjs    Copies built plugin files into test-vault (for iteration)
```

See [`AGENTS.md`](AGENTS.md) for contributor conventions.

## License

[MIT](LICENSE) © 2026 Stephen Monclova
