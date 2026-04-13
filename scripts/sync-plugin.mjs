#!/usr/bin/env node
/**
 * Copy the three built release files into test-vault's plugin folder.
 * Call after `npm run build` to propagate changes. Obsidian will see the
 * updated plugin on ⌘R (disable/enable the plugin once if the JS edits
 * the view constructor).
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PLUGIN_DIR = join(ROOT, "test-vault", ".obsidian", "plugins", "vault-pulse");

if (!existsSync(PLUGIN_DIR)) {
	mkdirSync(PLUGIN_DIR, { recursive: true });
}

let copied = 0;
for (const file of ["main.js", "manifest.json", "styles.css"]) {
	const src = join(ROOT, file);
	if (!existsSync(src)) {
		console.warn(`skipping ${file}: not found (run 'npm run build' first)`);
		continue;
	}
	copyFileSync(src, join(PLUGIN_DIR, file));
	copied++;
}

console.log(`Synced ${copied}/3 files to ${PLUGIN_DIR}`);
