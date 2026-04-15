import { describe, expect, it } from "vitest";
import { computeStreakSymbols } from "../src/streakSymbols";

describe("computeStreakSymbols", () => {
	it.each<[number, { flames: number; trophies: number }]>([
		[0, { flames: 0, trophies: 0 }],
		[6, { flames: 0, trophies: 0 }],
		[7, { flames: 1, trophies: 0 }],
		[29, { flames: 1, trophies: 0 }],
		[30, { flames: 2, trophies: 0 }],
		[99, { flames: 2, trophies: 0 }],
		[100, { flames: 3, trophies: 0 }],
		[364, { flames: 3, trophies: 0 }],
		[365, { flames: 3, trophies: 1 }],
		[1000, { flames: 3, trophies: 1 }],
	])("days=%i → %o", (days, expected) => {
		expect(computeStreakSymbols(days)).toEqual(expected);
	});
});
