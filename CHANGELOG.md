# Changelog

All notable changes to Vault Pulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- Author name updated to **Stefmf** in `manifest.json`, `package.json`, `LICENSE`, and `README.md`.

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
