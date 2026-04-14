# Contributing to Vault Pulse

Thanks for considering a contribution. This is a small sidebar plugin for Obsidian — the build and iteration loop is intentionally short.

## Local setup

```bash
git clone https://github.com/stefmf/vault-pulse.git
cd vault-pulse
npm install
npm run seed    # seeds ./test-vault/ with ~50 fake notes across 90 days
npm run build   # typecheck + production bundle
npm run sync    # copies main.js / manifest.json / styles.css into test-vault's plugin folder
```

Open `test-vault/` as an Obsidian vault and enable **Vault Pulse** under **Settings → Community plugins**.

For a tight dev loop:

```bash
npm run dev     # esbuild watch mode
# edit src/*.ts, then:
npm run sync    # re-copy the built bundle into the test-vault
# ⌘R in Obsidian to reload
```

## Tests

```bash
npm test            # vitest — pure function coverage
npm run test:watch  # watch mode
```

Pure modules (`dateUtils`, `colorUtils`, `data`) are expected to have test coverage for any new function or branch. View rendering and interactions are verified by manual testing in the scratch vault.

## Project layout & conventions

See [`AGENTS.md`](AGENTS.md) for the full map — module responsibilities, event/lifecycle rules, and the do/don't list. Contributors (human or agent) should read it before their first PR.

## Pull request checklist

- [ ] `npm test` passes
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] If a bug fix, the PR body references the issue (`Fixes #N`)
- [ ] If UI-affecting, a screenshot or short GIF is attached in the PR body
- [ ] New dependencies are discussed in the PR body (why it was needed, what was considered)

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Keep subject ≤72 chars. Body optional.

Examples:

- `feat: sparkline above legend`
- `fix: grid clips bottom row with visible scrollbar`
- `docs: document heat and sunset palettes`

## Releasing (maintainer only)

1. Bump the version in `manifest.json`, `package.json`, and add an entry to `versions.json`.
2. Commit: `chore: release X.Y.Z`.
3. Tag without a `v` prefix: `git tag X.Y.Z`.
4. Push both: `git push origin main X.Y.Z`.
5. The GitHub Actions release workflow builds and uploads `main.js`, `manifest.json`, and `styles.css` to the release. The community plugin catalog refreshes within an hour.

## License

MIT. By submitting a PR you agree your contributions ship under the same license.
