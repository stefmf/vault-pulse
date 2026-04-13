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
	const gridStart = computeGridStart(today, settings.weekStart);

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

	for (const file of source.getMarkdownFiles()) {
		const cache = source.getFileCache(file);
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
