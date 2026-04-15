# Changelog

All notable changes to Vault Pulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-04-15

### Fixed

- **Compositor-layer ghosting across Obsidian's UI** when Vault Pulse was enabled — visible as faint double-drawn text in the file-explorer sidebar during scroll. Root cause: `backdrop-filter: blur(12px) saturate(1.15)` on the detail-panel sticky header forced the pane into a persistent GPU compositor layer that bled into sibling layers under paint pressure. Replaced with a 92%-opacity `color-mix(var(--background-primary), transparent)` background. The header still reads as "sitting on top of the pane" without the expensive backdrop blur.

## [0.2.1] - 2026-04-15

### Changed

- **Single-pass vault scan** — `buildActivityMap` and `buildAllActivity` previously each did their own full walk through every markdown file. Merged into `buildVaultActivity` which produces both outputs in one iteration; the old functions stay as thin wrappers for backward compatibility.
- **Shared scan between plugin and view** — when the view is mounted, it publishes its already-computed `allActivity` + today's count into a plugin-level cache (`CACHE_MAX_AGE_MS = 1500ms`). The status bar reads from that cache before falling back to its own scan. Net effect on every file event when the pane is open: **one** vault walk instead of four.
- **Trailing-edge debounce** on both the view's `scheduleRefresh` (200ms) and the plugin's `scheduleStatusBar` (was 200ms, **now 1000ms**). A burst of file events — e.g. an Obsidian Git commit of 50 files — now collapses to one scan after the burst settles instead of firing at both the leading and trailing edges.
- **`workspace.on("css-change")` debounced** — was calling `this.refresh()` directly; now goes through `scheduleRefresh()` like every other event source.

### Fixed

- **App-wide sluggishness / glitchy sidebar scrolling with the plugin enabled** — the combined effect of the changes above. On large vaults with high event volume (dataview, git, sync), the plugin no longer holds the main thread long enough to drop frames elsewhere in Obsidian.

## [0.2.0] - 2026-04-15

### Added

- **Streak milestones** — lucide flame icons escalate 1 / 2 / 3 at the week / month / hundred-day marks, and a lucide trophy appears once the streak reaches 365 days. Click the trophy to see the year-1 anniversary date.
- **Honest streak beyond the window** — streak walk runs against an unbounded activity map so a 2-year streak reports as `731-day streak`, even though the heatmap only renders the last 365 days.
- **Lifetime-best streak** — persistent `· best N` stat in the detail header that survives broken streaks. Flashes gold when the current streak ties or beats the record.
- **Mini stats row** — `N WEEK · M MONTH · K YEAR` under the streak row. Values use tabular numerals; labels are uppercase micro-text. Relative to real today, not the selected day.
- **Status bar widget** — lucide flame + streak count (once ≥ 7 days) plus lucide file + today's count, rendered in Obsidian's bottom status bar. Click opens the pane. Kept fresh by plugin-level file-event subscriptions, independent of whether the view is mounted.
- **Window pager** — `◀ [range] ▶` above the heatmap steps backward through history one window at a time. Page size = current window length. Prev disables when earliest activity is already in view; next disables at offset 0. The existing **Today →** button doubles as "jump home" — resets the offset AND selects today in one click.
- **Four visibility toggles** under a new *Visibility* heading — `Show sparkline`, `Show streak counter`, `Show mini stats`, `Show status bar widget`. The sparkline row collapses completely when disabled (no border, no padding).
- **Tier-crossing celebration** — when the streak crosses into a new flame tier, the streak element fires a one-shot radial ripple + CSS confetti burst (18 pieces, accent palette).
- **Grand year celebration** — crossing into the first-year trophy runs a richer burst: 36 confetti pieces in a gold-heavy palette, extended travel distance, bigger scale-up ripple. The flame-tier bursts stay compact; the year gets its own visual weight.
- **Streak count-up tick** — short scale-up animation on the streak number when it increases.
- **Style Settings integration** — exposes `--vp-streak-flame-color` and `--vp-streak-trophy-color` for live tweaking when the Style Settings plugin is installed.
- **Localization scaffolding** — every user-facing string routes through `src/i18n/` with English shipping today. Community-contributed locales welcome; `Intl.PluralRules` handles singular/plural forms automatically.
- **Seed script CLI flags** — `--clean`, `--streak=N`, `--pre=N`, `--trophies=N`, `--tier=week|month|hundred|year`, `--per-day=N` or `--per-day=lo-hi`, `--tags=…`, `--in-folder=…`. Exercise any streak state locally without waiting for real calendar time.
- **`npm run lint:obsidian`** — runs the ObsidianReviewBot eslint rules locally. Short-circuits the 6-hour community-plugin bot feedback loop.

### Changed

- **Detail header translucency** — was an opaque `--background-secondary` seam against theme-translucent sidebars (Catppuccin Frappe, Minimal); now a `color-mix(var(--background-primary), 72%, transparent)` + `backdrop-filter: blur(12px)` surface that tracks whatever the theme is doing behind the pane.
- **Sparkline uses the full 4-level palette** — each bar's color comes from the same quantile buckets the heatmap uses (`--vp-level-1` through `--vp-level-4`), so activity intensity reads in both the bar height and its hue. Switching palettes retints the sparkline to match.
- **Cell selection easing** — selection outline now glides on a 260ms `cubic-bezier(0.2, 0.8, 0.2, 1)` instead of snapping.

### Fixed

- **Invisible sparkline baseline** — zero-count bars used `var(--background-modifier-border)`, which blended into the sidebar on dark themes (Catppuccin Frappe). Switched to `color-mix(var(--text-muted), 16%, transparent)` so empty days stay legible on every theme.
- **Muted accent on sparkline bars** — added a 1px accent-mixed halo so active bars lift off dark backgrounds.
- **Sparkline slot stayed visible when disabled** — `.vault-pulse-sparkline:empty` now collapses the row completely, removing its padding + bottom border.

## [0.1.5] - 2026-04-14

### Fixed

- Round-two `ObsidianReviewBot` feedback on [obsidianmd/obsidian-releases#11926](https://github.com/obsidianmd/obsidian-releases/pull/11926): remaining sentence-case violations in the ribbon tooltip, view display text, `Window length` description (reworded to avoid the "windows" brand collision), and the `Include tags` placeholder.

## [0.1.4] - 2026-04-14

### Added

- `CHANGELOG.md` tracking release notes per version.
- GitHub Actions CI workflow that runs `npm test` and `npm run build` on every pull request and every push to `main`.
- `.gitattributes` enforcing LF line endings for text files and marking common binary formats, so Windows contributors don't accidentally commit CRLF.

### Changed

- Release workflow now runs on Node 22 LTS (was Node 20; Node 20 is removed from GitHub runners on 2026-09-16).

### Fixed

- Address `ObsidianReviewBot` feedback on community-plugin submission ([obsidianmd/obsidian-releases#11926](https://github.com/obsidianmd/obsidian-releases/pull/11926)):
  - Elastic-scroll bounce no longer writes to `element.style.transform` / `element.style.willChange` directly — values flow through `setCssProps` and a `.vault-pulse-elastic-active` class.
  - Settings descriptions use sentence case ("color palette", "custom", and lowercased "at least one").
  - `activateView` now awaits `workspace.revealLeaf`.
  - `VaultPulseView.onOpen` / `onClose` no longer marked `async` without an `await` — they return `Promise<void>` explicitly.

## [0.1.3] - 2026-04-13

### Added

- **Sparkline** strip above the legend — 30 clickable bars for the last 30 days, height proportional to file count, accent color for active days.
- **Window length** setting (90 / 180 / 365 days) — shorter windows give a narrower grid with finer detail.
- **Exclude folders** filter — comma-separated path prefixes (e.g. `Archive, _templates`).
- **Include tags** filter — OR logic across frontmatter `tags:` and inline `#tags`; leading `#` optional.
- GitHub issue templates: structured YAML forms for bug reports and feature requests, with required fields for Obsidian version, OS, plugin settings, and console output.
- `CONTRIBUTING.md` with local setup, test, commit, and release instructions.

### Changed

- Test suite expanded from 51 → 60 cases, covering the filter logic and window-length parameterization.

## [0.1.2] - 2026-04-13

### Changed

- Author name updated to **Stephen Monclova** in `manifest.json`, `package.json`, `LICENSE`, and `README.md`.

## [0.1.1] - 2026-04-13

### Added

- Palette gallery in README — 3×2 grid showing Green, Heat, and Sunset palettes in both light and dark themes.

### Fixed

- Sidebar pane background now uses `--background-secondary` to match adjacent Obsidian sidebar panels instead of popping darker (was `--background-primary`).

## [0.1.0] - 2026-04-13

### Added

- Initial public release.
- Sidebar `ItemView` pane with an activity heatmap of the last 365 days (53 × 7 grid).
- Five color palettes: Auto (theme accent), Green (GitHub-style), Heat (orange → red), Sunset (gold → indigo), Custom hex.
- Quantile-based color bucketing (p25 / p50 / p75) so levels adapt to any vault size.
- Detail panel below the heatmap showing files for the selected day, with stagger-in animation.
- Streak indicator in the detail header when the selected day sits in a consecutive-activity run.
- "Today →" button in the detail header and `Vault Pulse: Jump to today` command palette entry.
- Keyboard navigation: Tab into the grid, ←/→ for ±week, ↑/↓ for ±day; detail panel updates as you move.
- ⌘-hover on file rows triggers Obsidian's native page preview.
- Today-cell marker, year-transition month labels, sticky detail header with scroll shadow.
- Apple-style scroll rubber-band — mass-spring-damper physics, SwiftUI `.spring()` default tuning (`response=0.55s`, `dampingFraction=0.825`).
- Live updates via `metadataCache.changed`, vault `create` / `modify` / `delete` / `rename`, and `workspace.css-change`.
- Reduced-motion support (all transitions and the scroll bounce disable when the OS has Reduce Motion enabled).
- GitHub Actions release workflow that attaches `main.js`, `manifest.json`, and `styles.css` as individual assets.

[Unreleased]: https://github.com/stefmf/vault-pulse/compare/0.1.3...HEAD
[0.1.3]: https://github.com/stefmf/vault-pulse/compare/0.1.2...0.1.3
[0.1.2]: https://github.com/stefmf/vault-pulse/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/stefmf/vault-pulse/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/stefmf/vault-pulse/releases/tag/0.1.0
