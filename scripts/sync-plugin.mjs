#!/usr/bin/env node
/**
 * Copy the three built release files into every known vault plugin folder.
 * Call after `npm run build` to propagate changes. Obsidian will see the
 * updated plugin on ⌘R (disable/enable the plugin once if the JS edits
 * the view constructor).
 *
 * Targets (each copied to if — and only if — it already exists):
 *   1. Personal vault: ~/Vaults/personal/.obsidian/plugins/vault-pulse/
 *   2. Repo-local test vault: <repo>/test-vault/.obsidian/plugins/vault-pulse/
 *
 * `data.json` is never touched — user settings + lifetime-best streak live
 * there. Targets that don't exist are skipped silently.
 */

import { copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TARGETS = [
	join(homedir(), "Vaults", "personal", ".obsidian", "plugins", "vault-pulse"),
	join(ROOT, "test-vault", ".obsidian", "plugins", "vault-pulse"),
];

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

for (const file of ARTIFACTS) {
	if (!existsSync(join(ROOT, file))) {
		console.error(`missing ${file} — run 'npm run build' first`);
		process.exit(1);
	}
}

let syncedAny = false;
for (const target of TARGETS) {
	if (!existsSync(target)) {
		console.log(`skipping (not installed): ${target}`);
		continue;
	}
	for (const file of ARTIFACTS) {
		copyFileSync(join(ROOT, file), join(target, file));
	}
	console.log(`synced ${ARTIFACTS.length} files → ${target}`);
	syncedAny = true;
}

if (!syncedAny) {
	console.warn("no vault plugin folders found — install the plugin in at least one vault first");
	process.exit(1);
}
