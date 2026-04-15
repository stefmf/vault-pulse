# Vault Pulse — testing & local development

Everything you need to iterate on the plugin locally: the test-vault layout, the seeding script, the lint/test commands. The repo's main [`README.md`](../README.md) is user-facing; this file is for contributors.

See also [`AGENTS.md`](../AGENTS.md) for module responsibilities, file-level conventions, and the lint/test/build pre-push checklist.

## Setup

```bash
git clone https://github.com/stefmf/vault-pulse.git
cd vault-pulse
npm install
```

## Commands

```bash
npm run dev              # esbuild watch — rebuilds main.js on every src/ change
npm run build            # tsc typecheck + production esbuild bundle
npm test                 # vitest, run-once
npm run test:watch       # vitest watch mode
npm run lint:obsidian    # ObsidianReviewBot eslint rules locally — short-circuits the 6h bot loop
npm run seed             # seed ./test-vault/ with 50 fake notes across ~90 days (default)
npm run sync             # copy built main.js / manifest.json / styles.css into test-vault plugin folder
```

## Test vault

`npm run seed` (no flags) generates a self-contained `test-vault/` at the repo root with frontmatter-dated notes, creates `.obsidian/plugins/vault-pulse/`, and copies the built plugin files in. The folder is gitignored.

**Open it as a vault** in Obsidian (File → Open Vault → Open folder as vault). Use a **full close-reopen** the first time so plugin discovery runs; from then on `⌘R` is enough.

After code changes, the iteration loop is:

```bash
npm run build && npm run sync
# then ⌘R in the test vault's Obsidian window
```

## Targeted seeding

The seed script accepts CLI flags so you can land any streak state without waiting for real calendar time:

| Flag | Effect |
|------|--------|
| `--clean` | Wipe `.md` files from the vault, keep the plugin install. |
| `--streak=N` | N-day unbroken streak ending today. |
| `--pre=N` | N additional active days *before* the streak, separated by a one-day gap. |
| `--trophies=N` | Shorthand for `--streak=<365·N + 1>` — N year trophies. |
| `--tier=week\|month\|hundred\|year` | Aliases for `--streak=7 / 30 / 100 / 365`. |
| `--per-day=N` or `--per-day=lo-hi` | Notes per day (fixed or range). Use a range to exercise the four-level palette. |
| `--tags=foo,bar` | Frontmatter tags — exercises the include-tags filter. |
| `--in-folder=Archive` | Place notes under a subfolder — exercises the exclude-folders filter. |

### Tier-crossover demo

The two-step pattern that triggers the celebration animation on reload:

```bash
npm run seed -- --streak=29 && open -a Obsidian   # ⌘R → 🔥 (1 flame)
npm run seed -- --streak=30                        # ⌘R → 1→2 flame burst (ripple + confetti)
npm run seed -- --streak=400 --per-day=1-4        # ⌘R → grand celebration (year trophy)
```

## Pre-push checklist

ObsidianReviewBot rescans the plugin submission within 6 hours of any push to `main`. Running its rule set locally first cuts that loop to seconds:

```bash
npm run lint:obsidian
npm test
npm run build
```

All three should be clean before tagging a release.

## Adding a locale

User-facing strings live in [`src/i18n/en.json`](../src/i18n/en.json). To add a new language:

1. Copy `en.json` to `<lang>.json` (e.g. `de.json`, `fr.json`).
2. Translate the string values — don't rename keys or change the `{placeholder}` tokens.
3. Register the bundle in [`src/i18n/index.ts`](../src/i18n/index.ts) (import + add to `LOCALES`).
4. Open a PR. Obsidian's `moment.locale()` auto-picks the right bundle for each user.

Plural-sensitive strings use an `Intl.PluralRules`-driven naming convention — see the `files_one` / `files_other` pair in `en.json`. Languages with more than two plural forms can provide `_zero`, `_two`, `_few`, `_many` alongside `_other` and the renderer will pick the right one.

## Project layout

```
src/
  main.ts            Plugin lifecycle, registerView, ribbon, commands, status bar widget
  view.ts            ItemView subclass, refresh orchestration, streak walk, tier burst, pager state
  renderer.ts        Pure DOM build (heatmap grid, month labels, sparkline, pager)
  detailPanel.ts     Date header, streak icons, mini stats, file list, anniversaries menu
  data.ts            buildVaultActivity (windowed map + unbounded counts in one pass)
  dateUtils.ts       Luxon date math (grid start, week/col indices, month labels)
  colorUtils.ts      Quantile buckets + palette dispatch
  streakSymbols.ts   Pure ladder (days → flame + trophy counts)
  interactions.ts    Hover tooltip, click selection, arrow-key navigation
  elasticScroll.ts   SwiftUI-tuned scroll bounce
  confetti.ts        CSS-driven particle burst for tier crossings
  i18n/              Locale bundles + t() helper
  settings.ts        Settings interface, defaults, PluginSettingTab
  types.ts           Shared interfaces
tests/               vitest suites for pure modules
scripts/
  seed-vault.mjs     Seeds test-vault/ with notes + installs built plugin
  sync-plugin.mjs    Copies built files into test-vault (for fast iteration)
```
