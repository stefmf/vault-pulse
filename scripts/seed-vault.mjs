#!/usr/bin/env node
/**
 * Seed a throwaway Obsidian vault with 50 fake .md notes spanning the last
 * ~90 days, plus symlink this repo as the vault's vault-pulse plugin so you
 * can iterate with `npm run dev` and just reload Obsidian.
 *
 * Usage: npm run seed
 * Vault lands at ./test-vault/ (gitignored).
 */

import {
	mkdirSync,
	writeFileSync,
	copyFileSync,
	existsSync,
	rmSync,
	readdirSync,
	lstatSync,
	unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const VAULT = join(ROOT, "test-vault");
const PLUGINS_DIR = join(VAULT, ".obsidian", "plugins");
const PLUGIN_DIR = join(PLUGINS_DIR, "vault-pulse");

const NOTE_COUNT = 50;
const WINDOW_DAYS = 90;
const TOPICS = [
	"meeting",
	"idea",
	"log",
	"research",
	"todo",
	"reading",
	"journal",
	"recipe",
	"project",
	"dream",
];

const pad2 = (n) => String(n).padStart(2, "0");
const iso = (d) =>
	`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function clearOldNotes() {
	if (!existsSync(VAULT)) return;
	for (const entry of readdirSync(VAULT)) {
		if (entry.endsWith(".md")) {
			unlinkSync(join(VAULT, entry));
		}
	}
}

function setupVault() {
	if (!existsSync(VAULT)) mkdirSync(VAULT, { recursive: true });
	if (!existsSync(PLUGINS_DIR)) mkdirSync(PLUGINS_DIR, { recursive: true });

	// Start clean. Prior versions of this script symlinked either the whole repo
	// (recursive loop) or individual files (Obsidian rejected the symlinks). Plain
	// copies are the only reliable discovery path across OSes.
	if (lstatSafe(PLUGIN_DIR)) {
		rmSync(PLUGIN_DIR, { recursive: true, force: true });
	}
	mkdirSync(PLUGIN_DIR, { recursive: true });

	for (const file of ["main.js", "manifest.json", "styles.css"]) {
		const src = join(ROOT, file);
		const dst = join(PLUGIN_DIR, file);
		if (!existsSync(src)) {
			console.warn(
				`WARN: ${file} not found at ${src}. Run 'npm run build' first.`
			);
			continue;
		}
		copyFileSync(src, dst);
	}
}

function lstatSafe(path) {
	try {
		return lstatSync(path);
	} catch {
		return null;
	}
}

function seedNotes() {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// Distribute notes across a skewed pattern: some busy days, some quiet.
	// Using a Gaussian-ish distribution around day 45 to cluster activity.
	for (let i = 0; i < NOTE_COUNT; i++) {
		const offset = Math.floor(Math.abs(gaussian()) * (WINDOW_DAYS / 3));
		const clampedOffset = Math.min(offset, WINDOW_DAYS - 1);

		const created = new Date(today);
		created.setDate(today.getDate() - clampedOffset);

		// Some files get touched again 0-14 days later
		const updateDelta = Math.floor(Math.random() * 15);
		const updated = new Date(created);
		updated.setDate(created.getDate() + updateDelta);
		if (updated > today) updated.setTime(today.getTime());

		const topic = TOPICS[i % TOPICS.length];
		const name = `${iso(created)}-${topic}-${i + 1}.md`;
		const content = `---
created: ${iso(created)}
updated: ${iso(updated)}
tags: [test, ${topic}]
---

# ${capitalize(topic)} ${i + 1}

Seeded note used to exercise Vault Pulse during local development.
`;
		writeFileSync(join(VAULT, name), content);
	}
}

function gaussian() {
	// Box-Muller
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function capitalize(s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

clearOldNotes();
setupVault();
seedNotes();

console.log(`Seeded ${NOTE_COUNT} notes in ${VAULT}`);
console.log(`Plugin installed at ${PLUGIN_DIR}`);
console.log("  main.js, manifest.json, styles.css copied from repo root.");
console.log("");
console.log("Next steps:");
console.log("  1. Open this vault in Obsidian (File → Open Vault → Open folder as vault)");
console.log("     Full close-reopen, not just ⌘R, so plugin discovery runs.");
console.log("  2. Settings → Community plugins → Turn on community plugins");
console.log("  3. Enable Vault Pulse under Installed plugins");
console.log("");
console.log("To iterate: edit src/, run `npm run build && npm run sync`, then ⌘R in Obsidian.");
