import { describe, it, expect } from "vitest";
import { computeCarryOverStreak } from "../src/streaks";

function makeMap(entries: Record<string, number>): Map<string, number> {
	return new Map(Object.entries(entries));
}

describe("computeCarryOverStreak", () => {
	it("returns null when today is in the activity set", () => {
		const map = makeMap({ "2026-04-12": 1, "2026-04-13": 3 });
		expect(computeCarryOverStreak(map, "2026-04-13")).toBeNull();
	});

	it("returns null when yesterday has no activity", () => {
		const map = makeMap({ "2026-04-10": 1 });
		expect(computeCarryOverStreak(map, "2026-04-13")).toBeNull();
	});

	it("returns null when yesterday was a single-day blip", () => {
		// Yesterday has activity, but the day before doesn't → only 1 day.
		const map = makeMap({ "2026-04-12": 1 });
		expect(computeCarryOverStreak(map, "2026-04-13")).toBeNull();
	});

	it("walks back through consecutive days ending at yesterday", () => {
		const map = makeMap({
			"2026-04-08": 1,
			"2026-04-09": 2,
			"2026-04-10": 1,
			"2026-04-11": 4,
			"2026-04-12": 1,
		});
		expect(computeCarryOverStreak(map, "2026-04-13")).toEqual({
			count: 5,
			startIso: "2026-04-08",
		});
	});

	it("stops at the first gap", () => {
		const map = makeMap({
			"2026-04-08": 1,
			// gap at 2026-04-09
			"2026-04-10": 1,
			"2026-04-11": 1,
			"2026-04-12": 1,
		});
		expect(computeCarryOverStreak(map, "2026-04-13")).toEqual({
			count: 3,
			startIso: "2026-04-10",
		});
	});

	it("walks across a year boundary", () => {
		const map = makeMap({
			"2025-12-30": 1,
			"2025-12-31": 1,
			"2026-01-01": 1,
		});
		expect(computeCarryOverStreak(map, "2026-01-02")).toEqual({
			count: 3,
			startIso: "2025-12-30",
		});
	});

	it("returns null when allActivity is empty", () => {
		expect(computeCarryOverStreak(new Map(), "2026-04-13")).toBeNull();
	});
});
