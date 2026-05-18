#!/usr/bin/env node
/**
 * Seed a throwaway Obsidian vault for local Vault Pulse development.
 *
 *   npm run seed                                # 50 notes over last 90 days (default)
 *   npm run seed -- --clean                     # wipe .md files, keep plugin install
 *   npm run seed -- --streak=30                 # unbroken 30-day streak ending today
 *   npm run seed -- --streak=30 --pre=10        # + 10 active days before the streak
 *                                               #   separated by a 1-day gap
 *   npm run seed -- --trophies=2                # shorthand for --streak=731
 *   npm run seed -- --tier=week|month|hundred|year
 *   npm run seed -- --streak=30 --per-day=1-4   # 1..4 notes per day (range)
 *   npm run seed -- --streak=15 --tags=project,journal
 *   npm run seed -- --streak=10 --in-folder=Archive
 *   npm run seed -- --streak=10 --end-offset=1  # streak ENDS yesterday — today
 *                                               #   is empty, triggers the
 *                                               #   carry-over chip + yellow
 *                                               #   flame + tinted today cell
 *
 * Always (re-)installs main.js / manifest.json / styles.css into the test
 * vault's plugins/vault-pulse dir. Run `npm run build` first.
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
	statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const VAULT = join(ROOT, "test-vault");
const PLUGINS_DIR = join(VAULT, ".obsidian", "plugins");
const PLUGIN_DIR = join(PLUGINS_DIR, "vault-pulse");

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

const TIER_ALIASES = { week: 7, month: 30, hundred: 100, year: 365 };

const args = parseArgs(process.argv.slice(2));

const pad2 = (n) => String(n).padStart(2, "0");
const iso = (d) =>
	`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseArgs(argv) {
	const out = {};
	for (const raw of argv) {
		if (!raw.startsWith("--")) continue;
		const [key, value] = raw.slice(2).split("=");
		out[key] = value ?? "true";
	}
	return out;
}

function parsePerDay(spec) {
	if (!spec) return () => 1;
	const m = /^(\d+)(?:-(\d+))?$/.exec(spec);
	if (!m) return () => 1;
	const lo = parseInt(m[1], 10);
	const hi = m[2] ? parseInt(m[2], 10) : lo;
	if (lo === hi) return () => lo;
	return () => lo + Math.floor(Math.random() * (hi - lo + 1));
}

function lstatSafe(path) {
	try {
		return lstatSync(path);
	} catch {
		return null;
	}
}

function clearOldNotes(rootDir) {
	if (!existsSync(rootDir)) return;
	for (const entry of readdirSync(rootDir)) {
		const full = join(rootDir, entry);
		// Never descend into .obsidian — that's our plugin install.
		if (entry === ".obsidian") continue;
		const st = lstatSafe(full);
		if (!st) continue;
		if (st.isDirectory()) {
			rmSync(full, { recursive: true, force: true });
		} else if (entry.endsWith(".md")) {
			unlinkSync(full);
		}
	}
}

function setupVault() {
	if (!existsSync(VAULT)) mkdirSync(VAULT, { recursive: true });
	if (!existsSync(PLUGINS_DIR)) mkdirSync(PLUGINS_DIR, { recursive: true });

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

function capitalize(s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function gaussian() {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function writeNoteOnDate(targetDir, date, i, tags) {
	const topic = TOPICS[i % TOPICS.length];
	const name = `${iso(date)}-${topic}-${i + 1}.md`;
	const tagFront = tags.length > 0 ? `[${tags.join(", ")}]` : `[test, ${topic}]`;
	const content = `---
created: ${iso(date)}
updated: ${iso(date)}
tags: ${tagFront}
---

# ${capitalize(topic)} ${i + 1}

Seeded note used to exercise Vault Pulse during local development.
`;
	writeFileSync(join(targetDir, name), content);
}

function seedLegacyGaussian() {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const NOTE_COUNT = 50;
	const WINDOW_DAYS = 90;

	for (let i = 0; i < NOTE_COUNT; i++) {
		const offset = Math.floor(Math.abs(gaussian()) * (WINDOW_DAYS / 3));
		const clampedOffset = Math.min(offset, WINDOW_DAYS - 1);
		const created = new Date(today);
		created.setDate(today.getDate() - clampedOffset);

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
	console.log(`Seeded ${NOTE_COUNT} notes over ~${WINDOW_DAYS} days.`);
}

function seedDeterministic(options) {
	const { streak, pre, perDayFn, tags, folder, endOffset } = options;
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const targetDir = folder ? join(VAULT, folder) : VAULT;
	if (folder && !existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

	let noteIdx = 0;

	// Streak ends `endOffset` days before today. endOffset=0 → ends today.
	// endOffset=1 → ends yesterday, today is empty (carry-over scenario).
	for (let offset = streak - 1; offset >= 0; offset--) {
		const d = new Date(today);
		d.setDate(today.getDate() - offset - endOffset);
		const n = perDayFn();
		for (let k = 0; k < n; k++) {
			writeNoteOnDate(targetDir, d, noteIdx++, tags);
		}
	}

	// Pre-streak activity, if requested. Starts `streak + 2` days BEFORE the
	// streak's earliest day to guarantee a 1-day gap between the two runs.
	for (let offset = 0; offset < pre; offset++) {
		const d = new Date(today);
		d.setDate(today.getDate() - (streak + 2 + offset + endOffset));
		const n = perDayFn();
		for (let k = 0; k < n; k++) {
			writeNoteOnDate(targetDir, d, noteIdx++, tags);
		}
	}

	const suffix = endOffset > 0 ? `, ends ${endOffset} day(s) ago` : "";
	console.log(
		`Seeded ${noteIdx} notes — streak=${streak}${pre > 0 ? `, pre=${pre}` : ""}${suffix}${folder ? `, folder=${folder}` : ""}${tags.length > 0 ? `, tags=[${tags.join(", ")}]` : ""}.`
	);
}

function resolveStreakLength() {
	if (args.streak) return parseInt(args.streak, 10);
	if (args.trophies) return parseInt(args.trophies, 10) * 365 + 1;
	if (args.tier && TIER_ALIASES[args.tier] != null) return TIER_ALIASES[args.tier];
	return null;
}

function resolveTags() {
	if (!args.tags) return [];
	return args.tags.split(",").map((t) => t.trim()).filter(Boolean);
}

// Main
setupVault();

if (args.clean) {
	clearOldNotes(VAULT);
	console.log("Cleaned .md files from vault (plugin install preserved).");
	process.exit(0);
}

clearOldNotes(VAULT);

const streakLen = resolveStreakLength();
if (streakLen != null && streakLen > 0) {
	seedDeterministic({
		streak: streakLen,
		pre: args.pre ? parseInt(args.pre, 10) : 0,
		perDayFn: parsePerDay(args["per-day"]),
		tags: resolveTags(),
		folder: args["in-folder"] ?? null,
		endOffset: args["end-offset"] ? parseInt(args["end-offset"], 10) : 0,
	});
} else {
	seedLegacyGaussian();
}

console.log(`Vault:  ${VAULT}`);
console.log(`Plugin: ${PLUGIN_DIR}`);
console.log("");
console.log("Next steps:");
console.log("  1. Open this vault in Obsidian (File → Open Vault → Open folder as vault).");
console.log("     Full close-reopen, not just ⌘R, so plugin discovery runs.");
console.log("  2. Settings → Community plugins → Turn on community plugins.");
console.log("  3. Enable Vault Pulse under Installed plugins.");
console.log("");
console.log("To iterate: edit src/, run `npm run build && npm run sync`, then ⌘R in Obsidian.");
