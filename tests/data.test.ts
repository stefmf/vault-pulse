import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { TFile, type CachedMetadata } from "obsidian";
import { buildActivityMap, extractDates, type DataSource } from "../src/data";
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
