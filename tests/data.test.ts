import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { TFile, type CachedMetadata } from "obsidian";
import {
	buildActivityMap,
	buildVaultActivity,
	extractDates,
	fingerprintActivity,
	parseFilters,
	type DataSource,
} from "../src/data";
import { DEFAULT_SETTINGS, type VaultPulseSettings } from "../src/settings";

function mkFile(path: string, ctime: number, mtime: number): TFile {
	return new TFile(path, { ctime, mtime, size: 10 });
}

function mkSource(
	files: TFile[],
	cacheFor: (file: TFile) => CachedMetadata | null = () => null
): DataSource {
	return {
		getMarkdownFiles: () => files,
		getFileCache: cacheFor,
	};
}

const TODAY = DateTime.fromISO("2026-04-13").startOf("day");

function settings(overrides: Partial<VaultPulseSettings> = {}): VaultPulseSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("extractDates", () => {
	it("falls back to stat when no frontmatter is present", () => {
		const ctime = DateTime.fromISO("2026-04-10").toMillis();
		const mtime = DateTime.fromISO("2026-04-12").toMillis();
		const { created, updated } = extractDates(mkFile("a.md", ctime, mtime), null);
		expect(created?.toISODate()).toBe("2026-04-10");
		expect(updated?.toISODate()).toBe("2026-04-12");
	});

	it("uses frontmatter.created/updated when present (ISO strings)", () => {
		const file = mkFile("a.md", 0, 0);
		const cache: CachedMetadata = {
			frontmatter: {
				created: "2026-01-05",
				updated: "2026-01-06T13:14:15",
			},
		};
		const { created, updated } = extractDates(file, cache);
		expect(created?.toISODate()).toBe("2026-01-05");
		expect(updated?.toISODate()).toBe("2026-01-06");
	});

	it("parses frontmatter dates from JS Date objects", () => {
		const file = mkFile("a.md", 0, 0);
		const cache: CachedMetadata = {
			frontmatter: {
				created: new Date("2026-03-15T12:00:00Z"),
				updated: new Date("2026-03-20T08:00:00Z"),
			},
		};
		const { created, updated } = extractDates(file, cache);
		expect(created?.year).toBe(2026);
		expect(updated?.month).toBe(3);
	});

	it("parses frontmatter dates from numeric epochs", () => {
		const file = mkFile("a.md", 0, 0);
		const cache: CachedMetadata = {
			frontmatter: {
				created: DateTime.fromISO("2026-02-01").toMillis(),
			},
		};
		const { created } = extractDates(file, cache);
		expect(created?.toISODate()).toBe("2026-02-01");
	});
});

describe("buildActivityMap", () => {
	it("initializes every day in the grid window with zero count", () => {
		const map = buildActivityMap(mkSource([]), settings(), { today: TODAY });
		expect(map.size).toBeGreaterThanOrEqual(365);
		expect(map.size).toBeLessThanOrEqual(371);
		for (const day of map.values()) {
			expect(day.count).toBe(0);
			expect(day.files).toEqual([]);
		}
	});

	it("counts a file by its updated date in Modified-only mode", () => {
		const file = mkFile(
			"a.md",
			DateTime.fromISO("2026-04-10").toMillis(),
			DateTime.fromISO("2026-04-12").toMillis()
		);
		const map = buildActivityMap(
			mkSource([file]),
			settings({ activitySource: "modified" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-12")?.count).toBe(1);
		expect(map.get("2026-04-10")?.count).toBe(0); // created not counted
	});

	it("counts a file by its created date in Created-only mode", () => {
		const file = mkFile(
			"a.md",
			DateTime.fromISO("2026-04-10").toMillis(),
			DateTime.fromISO("2026-04-12").toMillis()
		);
		const map = buildActivityMap(
			mkSource([file]),
			settings({ activitySource: "created" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-10")?.count).toBe(1);
		expect(map.get("2026-04-12")?.count).toBe(0);
	});

	it("combined mode counts both created and updated days, deduped per file", () => {
		const file = mkFile(
			"a.md",
			DateTime.fromISO("2026-04-10").toMillis(),
			DateTime.fromISO("2026-04-12").toMillis()
		);
		const map = buildActivityMap(
			mkSource([file]),
			settings({ activitySource: "combined" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-10")?.count).toBe(1);
		expect(map.get("2026-04-12")?.count).toBe(1);
	});

	it("combined mode counts a new file (created === updated) exactly once", () => {
		const same = DateTime.fromISO("2026-04-11").toMillis();
		const file = mkFile("a.md", same, same);
		const map = buildActivityMap(
			mkSource([file]),
			settings({ activitySource: "combined" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-11")?.count).toBe(1);
	});

	it("ignores files whose dates fall outside the grid window", () => {
		const ancient = DateTime.fromISO("2010-01-01").toMillis();
		const file = mkFile("old.md", ancient, ancient);
		const map = buildActivityMap(mkSource([file]), settings(), { today: TODAY });
		for (const day of map.values()) {
			expect(day.count).toBe(0);
		}
	});

	it("prefers frontmatter dates over file stat", () => {
		const file = mkFile(
			"a.md",
			DateTime.fromISO("2020-01-01").toMillis(),
			DateTime.fromISO("2020-01-02").toMillis()
		);
		const cache: CachedMetadata = {
			frontmatter: {
				created: "2026-03-01",
				updated: "2026-03-05",
			},
		};
		const map = buildActivityMap(
			mkSource([file], () => cache),
			settings({ activitySource: "combined" }),
			{ today: TODAY }
		);
		expect(map.get("2026-03-01")?.count).toBe(1);
		expect(map.get("2026-03-05")?.count).toBe(1);
	});

	it("handles multiple files on the same day correctly", () => {
		const modDay = DateTime.fromISO("2026-04-10").toMillis();
		const files = [
			mkFile("a.md", modDay, modDay),
			mkFile("b.md", modDay, modDay),
			mkFile("c.md", modDay, modDay),
		];
		const map = buildActivityMap(mkSource(files), settings(), { today: TODAY });
		const day = map.get("2026-04-10");
		expect(day?.count).toBe(3);
		expect(day?.files).toHaveLength(3);
	});
});

describe("buildActivityMap with custom windowDays", () => {
	it("produces a smaller map for a 90-day window", () => {
		const map = buildActivityMap(
			mkSource([]),
			settings({ windowDays: 90 }),
			{ today: TODAY }
		);
		// 90 day window + up to 6 days of week-alignment slack.
		expect(map.size).toBeGreaterThanOrEqual(90);
		expect(map.size).toBeLessThanOrEqual(96);
	});

	it("ignores activity outside the shorter window", () => {
		// File created 200 days ago — inside a 365-day window, outside a 90-day window.
		const oldTs = TODAY.minus({ days: 200 }).toMillis();
		const file = mkFile("old.md", oldTs, oldTs);
		const mapLong = buildActivityMap(
			mkSource([file]),
			settings({ windowDays: 365 }),
			{ today: TODAY }
		);
		const mapShort = buildActivityMap(
			mkSource([file]),
			settings({ windowDays: 90 }),
			{ today: TODAY }
		);
		const long = [...mapLong.values()].reduce((a, d) => a + d.count, 0);
		const short = [...mapShort.values()].reduce((a, d) => a + d.count, 0);
		expect(long).toBeGreaterThan(0);
		expect(short).toBe(0);
	});
});

describe("buildActivityMap filters", () => {
	function modTs(iso: string) {
		return DateTime.fromISO(iso).toMillis();
	}

	it("excludes files whose path starts with an excluded folder", () => {
		const today = modTs("2026-04-12");
		const files = [
			mkFile("work/meeting.md", today, today),
			mkFile("Archive/old.md", today, today),
			mkFile("Archive/deep/nested.md", today, today),
		];
		const map = buildActivityMap(
			mkSource(files),
			settings({ excludeFolders: "Archive" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-12")?.count).toBe(1);
		expect(map.get("2026-04-12")?.files[0].path).toBe("work/meeting.md");
	});

	it("exclude matches prefix only, not middle-of-path", () => {
		const today = modTs("2026-04-12");
		const files = [
			mkFile("My Archive/note.md", today, today), // NOT excluded
			mkFile("Archive/note.md", today, today), // excluded
		];
		const map = buildActivityMap(
			mkSource(files),
			settings({ excludeFolders: "Archive" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-12")?.count).toBe(1);
		expect(map.get("2026-04-12")?.files[0].path).toBe("My Archive/note.md");
	});

	it("handles multiple comma-separated excluded folders", () => {
		const today = modTs("2026-04-12");
		const files = [
			mkFile("work/a.md", today, today),
			mkFile("Archive/b.md", today, today),
			mkFile("_templates/c.md", today, today),
		];
		const map = buildActivityMap(
			mkSource(files),
			settings({ excludeFolders: "Archive, _templates" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-12")?.count).toBe(1);
	});

	it("includeTags requires at least one matching tag (OR logic)", () => {
		const today = modTs("2026-04-12");
		const a = mkFile("a.md", today, today);
		const b = mkFile("b.md", today, today);
		const c = mkFile("c.md", today, today);
		const cacheFor = (f: TFile): CachedMetadata => {
			if (f.path === "a.md")
				return { frontmatter: { tags: ["project"] } };
			if (f.path === "b.md")
				return { frontmatter: { tags: ["journal", "misc"] } };
			if (f.path === "c.md") return { frontmatter: { tags: ["other"] } };
			return {};
		};
		const map = buildActivityMap(
			mkSource([a, b, c], cacheFor),
			settings({ includeTags: "project, journal" }),
			{ today: TODAY }
		);
		// a has project, b has journal → both count. c doesn't match.
		expect(map.get("2026-04-12")?.count).toBe(2);
	});

	it("strips leading # on include tags", () => {
		const today = modTs("2026-04-12");
		const file = mkFile("a.md", today, today);
		const map = buildActivityMap(
			mkSource([file], () => ({ frontmatter: { tags: ["project"] } })),
			settings({ includeTags: "#project" }),
			{ today: TODAY }
		);
		expect(map.get("2026-04-12")?.count).toBe(1);
	});

	it("no filters (defaults) includes all files", () => {
		const today = modTs("2026-04-12");
		const files = [
			mkFile("work/a.md", today, today),
			mkFile("Archive/b.md", today, today),
			mkFile("anywhere/c.md", today, today),
		];
		const map = buildActivityMap(mkSource(files), settings(), {
			today: TODAY,
		});
		expect(map.get("2026-04-12")?.count).toBe(3);
	});
});

describe("fingerprintActivity", () => {
	const ts = (iso: string) => DateTime.fromISO(iso).toMillis();

	it("returns identical fingerprints for identical scans", () => {
		const today = ts("2026-04-12");
		const files = [mkFile("a.md", today, today), mkFile("b.md", today, today)];
		const a = buildVaultActivity(mkSource(files), settings(), { today: TODAY });
		const b = buildVaultActivity(mkSource(files), settings(), { today: TODAY });
		expect(fingerprintActivity(a.windowed, a.allActivity)).toBe(
			fingerprintActivity(b.windowed, b.allActivity)
		);
	});

	it("differs when a windowed day's count changes", () => {
		const today = ts("2026-04-12");
		const before = buildVaultActivity(
			mkSource([mkFile("a.md", today, today)]),
			settings(),
			{ today: TODAY }
		);
		const after = buildVaultActivity(
			mkSource([mkFile("a.md", today, today), mkFile("b.md", today, today)]),
			settings(),
			{ today: TODAY }
		);
		expect(fingerprintActivity(before.windowed, before.allActivity)).not.toBe(
			fingerprintActivity(after.windowed, after.allActivity)
		);
	});

	it("differs when allActivity gains a day outside the window", () => {
		const insideWindow = ts("2026-04-12");
		const longAgo = DateTime.fromISO("2024-01-01").toMillis();
		const before = buildVaultActivity(
			mkSource([mkFile("a.md", insideWindow, insideWindow)]),
			settings(),
			{ today: TODAY }
		);
		const after = buildVaultActivity(
			mkSource([
				mkFile("a.md", insideWindow, insideWindow),
				mkFile("old.md", longAgo, longAgo),
			]),
			settings(),
			{ today: TODAY }
		);
		expect(fingerprintActivity(before.windowed, before.allActivity)).not.toBe(
			fingerprintActivity(after.windowed, after.allActivity)
		);
	});
});

describe("parseFilters + buildVaultActivity reuse", () => {
	const ts = (iso: string) => DateTime.fromISO(iso).toMillis();

	it("yields the same scan when filters are pre-parsed vs inline-parsed", () => {
		const today = ts("2026-04-12");
		const files = [
			mkFile("Archive/a.md", today, today),
			mkFile("notes/b.md", today, today),
		];
		const config = settings({ excludeFolders: "Archive" });
		const inline = buildVaultActivity(mkSource(files), config, { today: TODAY });
		const preParsed = buildVaultActivity(mkSource(files), config, {
			today: TODAY,
			filters: parseFilters(config),
		});
		expect(fingerprintActivity(inline.windowed, inline.allActivity)).toBe(
			fingerprintActivity(preParsed.windowed, preParsed.allActivity)
		);
	});
});
