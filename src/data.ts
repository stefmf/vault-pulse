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

export interface ParsedFilters {
	excludedFolders: string[];
	/** Already lowercased + leading-`#` stripped. */
	includedTags: string[];
}

export interface BuildOptions {
	/**
	 * Real "today" — the upper bound for dates that land in `allActivity`.
	 * Defaults to `DateTime.local()`. Tests pin this for determinism.
	 */
	today?: DateTime;
	/**
	 * Right-edge of the heatmap window. Defaults to `today`. When the user
	 * pages backward, callers pass an earlier date here to shift the grid
	 * without affecting `allActivity`'s upper bound.
	 */
	anchor?: DateTime;
	/**
	 * Pre-parsed filter lists. Cache on the plugin and pass through to skip
	 * `parseCsvList` on every scan — filters change rarely, scans are
	 * frequent. When omitted, the parser runs inside this function as before.
	 */
	filters?: ParsedFilters;
}

/** Normalize raw CSV settings into the form `buildVaultActivity` consumes. */
export function parseFilters(settings: VaultPulseSettings): ParsedFilters {
	return {
		excludedFolders: parseCsvList(settings.excludeFolders),
		includedTags: parseCsvList(settings.includeTags).map(normalizeTag),
	};
}

export interface VaultActivity {
	/** Windowed by the heatmap window; each entry has `files[]` + `count`. */
	windowed: ActivityMap;
	/** Unbounded per-day counts across the whole vault, for streak walks + stats. */
	allActivity: Map<string, number>;
}

/**
 * Walk the vault once and produce BOTH the windowed activity map (for
 * heatmap rendering) and the unbounded per-day count map (for streak walks
 * + mini-stats totals). Previously `buildActivityMap` and `buildAllActivity`
 * each did their own full pass, doubling the work on every file event.
 *
 * Filter semantics are identical to the prior single-purpose functions
 * (excludeFolders + includeTags + activitySource).
 *
 * `today` and `anchor` can differ when the user pages the heatmap backward:
 * `today` still caps `allActivity` at the real calendar day, while `anchor`
 * sets the grid's right edge.
 */
export function buildVaultActivity(
	source: DataSource,
	settings: VaultPulseSettings,
	options: BuildOptions = {}
): VaultActivity {
	const today = (options.today ?? DateTime.local()).startOf("day");
	const anchor = (options.anchor ?? today).startOf("day");
	const gridStart = computeGridStart(anchor, settings.weekStart, settings.windowDays);
	const gridStartIso = toISODate(gridStart);
	const anchorIso = toISODate(anchor);
	const todayIso = toISODate(today);

	const windowed: ActivityMap = new Map();
	for (
		let cursor = gridStart;
		cursor <= anchor;
		cursor = cursor.plus({ days: 1 })
	) {
		const iso = toISODate(cursor);
		const day: ActivityDay = { isoDate: iso, files: [], count: 0 };
		windowed.set(iso, day);
	}

	const allActivity = new Map<string, number>();

	const filters = options.filters ?? parseFilters(settings);
	const excludedFolders = filters.excludedFolders;
	const includedTags = filters.includedTags;

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

			// Unbounded counts — streak walk + stats need days older than
			// the visible window.
			allActivity.set(iso, (allActivity.get(iso) ?? 0) + 1);

			// Windowed view — heatmap + sparkline render only these.
			if (iso < gridStartIso || iso > anchorIso) continue;
			const day = windowed.get(iso);
			if (day) {
				day.files.push(file);
				day.count++;
			}
		}
	}

	return { windowed, allActivity };
}

/**
 * Lightweight content fingerprint of a vault scan. Cheap to compute (one
 * pass over the windowed map + one pass over `allActivity.values()`) and
 * cheap to compare (string equality). Used by the view to short-circuit
 * the entire render path when an event fires but nothing the heatmap shows
 * has actually changed — e.g. Obsidian-internal cache churn from frontmatter
 * reads that don't bump `created` / `updated`.
 *
 * Two different scans produce identical fingerprints only when they would
 * render identically: every windowed day's count matches AND `allActivity`
 * has the same total + same number of distinct days. Beyond-window changes
 * surface in the size + sum.
 */
export function fingerprintActivity(
	windowed: ActivityMap,
	allActivity: Map<string, number>
): string {
	const parts: string[] = [`a:${allActivity.size}`];
	let allSum = 0;
	for (const n of allActivity.values()) allSum += n;
	parts.push(`s:${allSum}`);
	for (const [iso, day] of windowed) parts.push(`${iso}=${day.count}`);
	return parts.join("|");
}

/**
 * Thin wrapper: returns just the windowed map. Preserves the original
 * `options.today` semantics (grid anchor + upper bound), so existing tests
 * and callers don't need to change.
 */
export function buildActivityMap(
	source: DataSource,
	settings: VaultPulseSettings,
	options: BuildOptions = {}
): ActivityMap {
	const pinned = options.today;
	return buildVaultActivity(source, settings, {
		today: pinned,
		anchor: pinned,
	}).windowed;
}

/**
 * Thin wrapper: returns just `allActivity`. Per-day file counts across the
 * WHOLE vault (not just the heatmap window). Streak walkers can still treat
 * this as a set via `.has(iso)`.
 */
export function buildAllActivity(
	source: DataSource,
	settings: VaultPulseSettings,
	options: BuildOptions = {}
): Map<string, number> {
	return buildVaultActivity(source, settings, options).allActivity;
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
