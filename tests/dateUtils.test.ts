import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
	GRID_COLS,
	computeGridStart,
	computeMonthLabels,
	toISODate,
	totalColumns,
	weekColumn,
	weekRow,
} from "../src/dateUtils";

describe("toISODate", () => {
	it("formats as YYYY-MM-DD", () => {
		expect(toISODate(DateTime.fromISO("2026-04-13"))).toBe("2026-04-13");
		expect(toISODate(DateTime.fromISO("2026-01-05"))).toBe("2026-01-05");
	});
});

describe("computeGridStart", () => {
	it("returns a Sunday when weekStart = 0", () => {
		// 2026-04-13 is a Monday
		const today = DateTime.fromISO("2026-04-13");
		const gridStart = computeGridStart(today, 0);
		expect(gridStart.weekday).toBe(7); // Luxon Sunday
	});

	it("returns a Monday when weekStart = 1", () => {
		const today = DateTime.fromISO("2026-04-13");
		const gridStart = computeGridStart(today, 1);
		expect(gridStart.weekday).toBe(1); // Luxon Monday
	});

	it("places gridStart 364-370 days before today", () => {
		for (const iso of [
			"2026-04-13",
			"2026-01-01",
			"2025-12-31",
			"2026-07-04",
		]) {
			const today = DateTime.fromISO(iso);
			const gridStart = computeGridStart(today, 0);
			const diff = Math.floor(today.diff(gridStart, "days").days);
			expect(diff).toBeGreaterThanOrEqual(364);
			expect(diff).toBeLessThanOrEqual(370);
		}
	});
});

describe("weekRow", () => {
	it("maps Sunday to row 0 when weekStart = 0", () => {
		const sunday = DateTime.fromISO("2026-04-12");
		expect(weekRow(sunday, 0)).toBe(0);
	});

	it("maps Saturday to row 6 when weekStart = 0", () => {
		const saturday = DateTime.fromISO("2026-04-11");
		expect(weekRow(saturday, 0)).toBe(6);
	});

	it("maps Monday to row 0 when weekStart = 1", () => {
		const monday = DateTime.fromISO("2026-04-13");
		expect(weekRow(monday, 1)).toBe(0);
	});

	it("maps Sunday to row 6 when weekStart = 1", () => {
		const sunday = DateTime.fromISO("2026-04-12");
		expect(weekRow(sunday, 1)).toBe(6);
	});
});

describe("weekColumn", () => {
	it("returns 0 for gridStart itself", () => {
		const gridStart = DateTime.fromISO("2025-04-13");
		expect(weekColumn(gridStart, gridStart)).toBe(0);
	});

	it("returns N for N weeks later", () => {
		const gridStart = DateTime.fromISO("2025-04-13");
		expect(weekColumn(gridStart.plus({ days: 7 }), gridStart)).toBe(1);
		expect(weekColumn(gridStart.plus({ days: 14 }), gridStart)).toBe(2);
		expect(weekColumn(gridStart.plus({ days: 52 * 7 }), gridStart)).toBe(52);
	});
});

describe("totalColumns", () => {
	it("is 53 columns for any anchor date", () => {
		for (const iso of [
			"2026-04-13",
			"2026-01-01",
			"2025-12-31",
			"2026-07-04",
			"2024-02-29",
		]) {
			const today = DateTime.fromISO(iso);
			const gridStart = computeGridStart(today, 0);
			expect(totalColumns(gridStart, today)).toBe(GRID_COLS);
		}
	});
});

describe("computeMonthLabels", () => {
	it("labels the first column with the gridStart month", () => {
		const today = DateTime.fromISO("2026-04-13");
		const gridStart = computeGridStart(today, 0);
		const labels = computeMonthLabels(gridStart, today);
		expect(labels[0].startCol).toBe(0);
	});

	it("spans cover the full grid width", () => {
		const today = DateTime.fromISO("2026-04-13");
		const gridStart = computeGridStart(today, 0);
		const labels = computeMonthLabels(gridStart, today);
		const cols = totalColumns(gridStart, today);
		const total = labels.reduce((acc, l) => acc + l.span, 0);
		expect(total).toBe(cols);
	});

	it("emits one label per distinct month (usually 12-13 for a 365-day window)", () => {
		const today = DateTime.fromISO("2026-04-13");
		const gridStart = computeGridStart(today, 0);
		const labels = computeMonthLabels(gridStart, today);
		expect(labels.length).toBeGreaterThanOrEqual(12);
		expect(labels.length).toBeLessThanOrEqual(14);
	});

	it("labels never repeat in adjacent positions (year-boundary windows still emit 12-13 labels, same name may appear twice)", () => {
		const today = DateTime.fromISO("2026-01-15");
		const gridStart = computeGridStart(today, 0);
		const labels = computeMonthLabels(gridStart, today);
		for (let i = 1; i < labels.length; i++) {
			expect(labels[i].name).not.toBe(labels[i - 1].name);
		}
		expect(labels.length).toBeGreaterThanOrEqual(12);
		expect(labels.length).toBeLessThanOrEqual(14);
	});
});
