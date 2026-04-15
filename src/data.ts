import { DateTime } from "luxon";
import type { App, CachedMetadata, TFile } from "obsidian";
import { computeGridStart, toISODate } from "./dateUtils";
import type { ActivityDay, ActivityMap } from "./types";
import type { VaultPulseSettings } from "./settings";

/**
 * Minimum surface of App we depend on. Keeps tests injectable without
 * instantiating the full Obsidian runtime.
 */
export interface DataSource {
	getMarkdownFiles(): TFile[];
	getFileCache(file: TFile): CachedMetadata | null;
}

export function fromApp(app: App): DataSource {
	return {
		getMarkdownFiles: () => app.vault.getMarkdownFiles(),
		getFileCache: (file) => app.metadataCache.getFileCache(file),
	};
}

export interface BuildOptions {
	today?: DateTime;
}

export function buildActivityMap(
	source: DataSource,
	settings: VaultPulseSettings,
	options: BuildOptions = {}
): ActivityMap {
	const today = (options.today ?? DateTime.local()).startOf("day");
	const gridStart = computeGridStart(today, settings.weekStart, settings.windowDays);

	const map: ActivityMap = new Map();

	for (
		let cursor = gridStart;
		cursor <= today;
		cursor = cursor.plus({ days: 1 })
	) {
		const iso = toISODate(cursor);
		const day: ActivityDay = { isoDate: iso, files: [], count: 0 };
		map.set(iso, day);
	}

	const gridStartIso = toISODate(gridStart);
	const todayIso = toISODate(today);

	const excludedFolders = parseCsvList(settings.excludeFolders);
	const includedTags = parseCsvList(settings.includeTags).map(normalizeTag);

	for (const file of source.getMarkdownFiles()) {
		const cache = source.getFileCache(file);
		if (!fileMatchesFilters(file, cache, excludedFolders, includedTags)) continue;

		const { created, updated } = extractDates(file, cache);

		const touched = new Set<string>();
		if (settings.activitySource !== "modified" && created) {
			touched.add(toISODate(created));
		}
		if (settings.activitySource !== "created" && updated) {
			touched.add(toISODate(updated));
		}

		for (const iso of touched) {
			if (iso < gridStartIso || iso > todayIso) continue;
			const day = map.get(iso);
			if (day) {
				day.files.push(file);
				day.count++;
			}
		}
	}

	return map;
}

/**
 * Per-day file counts across the WHOLE vault (not just within the configured
 * window). Returns `Map<isoDate, count>`.
 *
 * Why it exists: `buildActivityMap` scopes its output to the heatmap window
 * (max 365 days) for rendering, but the streak walk AND the detail panel's
 * mini-stats line need to see activity past that boundary — otherwise a
 * 2-year streak would display as "367-day streak" and "this year" totals
 * would cap at the window.
 *
 * Streak walkers can still treat this as a set via `.has(iso)`.
 * Same filter semantics as `buildActivityMap` (excludeFolders, includeTags,
 * activitySource). Dedupes when a file's created+updated fall on the same
 * day so the count matches `buildActivityMap`'s `day.count`.
 */
export function buildAllActivity(
	source: DataSource,
	settings: VaultPulseSettings,
	options: BuildOptions = {}
): Map<string, number> {
	const today = (options.today ?? DateTime.local()).startOf("day");
	const todayIso = toISODate(today);

	const excludedFolders = parseCsvList(settings.excludeFolders);
	const includedTags = parseCsvList(settings.includeTags).map(normalizeTag);

	const counts = new Map<string, number>();

	for (const file of source.getMarkdownFiles()) {
		const cache = source.getFileCache(file);
		if (!fileMatchesFilters(file, cache, excludedFolders, includedTags)) continue;

		const { created, updated } = extractDates(file, cache);

		const touched = new Set<string>();
		if (settings.activitySource !== "modified" && created) {
			touched.add(toISODate(created));
		}
		if (settings.activitySource !== "created" && updated) {
			touched.add(toISODate(updated));
		}

		for (const iso of touched) {
			if (iso > todayIso) continue;
			counts.set(iso, (counts.get(iso) ?? 0) + 1);
		}
	}

	return counts;
}

export function extractDates(
	file: TFile,
	cache: CachedMetadata | null
): { created: DateTime | null; updated: DateTime | null } {
	const fm = cache?.frontmatter;
	const created =
		parseFrontmatterDate(fm?.created) ?? DateTime.fromMillis(file.stat.ctime);
	const updated =
		parseFrontmatterDate(fm?.updated) ?? DateTime.fromMillis(file.stat.mtime);

	return {
		created: created.isValid ? created.startOf("day") : null,
		updated: updated.isValid ? updated.startOf("day") : null,
	};
}

/**
 * Decide whether a file should contribute to the activity map based on
 * the user's folder-exclude and tag-include filters.
 *
 * Folder matching is prefix-based: "Archive" excludes "Archive/x.md" and
 * "Archive" itself, but NOT "My-Archive/x.md".
 *
 * Tag matching is OR: if any required tags are configured, the file must
 * have at least one of them. Tags are gathered from both frontmatter and
 * inline `#tags`. Leading `#` is stripped for comparison.
 */
export function fileMatchesFilters(
	file: TFile,
	cache: CachedMetadata | null,
	excludedFolders: string[],
	includedTags: string[]
): boolean {
	for (const folder of excludedFolders) {
		if (file.path === folder || file.path.startsWith(folder + "/")) {
			return false;
		}
	}

	if (includedTags.length === 0) return true;

	const fileTags = extractFileTags(cache);
	for (const required of includedTags) {
		if (fileTags.has(required)) return true;
	}
	return false;
}

export function extractFileTags(cache: CachedMetadata | null): Set<string> {
	const tags = new Set<string>();
	if (!cache) return tags;

	const fmTags = cache.frontmatter?.tags ?? cache.frontmatter?.tag;
	if (Array.isArray(fmTags)) {
		for (const t of fmTags) tags.add(normalizeTag(String(t)));
	} else if (typeof fmTags === "string") {
		for (const t of fmTags.split(/[,\s]+/)) {
			const n = normalizeTag(t);
			if (n) tags.add(n);
		}
	}

	const inlineTags = (cache as unknown as { tags?: Array<{ tag: string }> }).tags;
	if (Array.isArray(inlineTags)) {
		for (const entry of inlineTags) {
			tags.add(normalizeTag(entry.tag));
		}
	}

	return tags;
}

function parseCsvList(s: string): string[] {
	return s
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
}

function normalizeTag(t: string): string {
	return t.replace(/^#/, "").toLowerCase();
}

function parseFrontmatterDate(value: unknown): DateTime | null {
	if (value === null || value === undefined) return null;

	if (value instanceof Date) {
		const dt = DateTime.fromJSDate(value);
		return dt.isValid ? dt : null;
	}

	if (typeof value === "string") {
		let dt = DateTime.fromISO(value);
		if (dt.isValid) return dt;

		dt = DateTime.fromSQL(value);
		if (dt.isValid) return dt;

		const d = new Date(value);
		if (!isNaN(d.getTime())) {
			return DateTime.fromJSDate(d);
		}
	}

	if (typeof value === "number") {
		const dt = DateTime.fromMillis(value);
		return dt.isValid ? dt : null;
	}

	return null;
}
