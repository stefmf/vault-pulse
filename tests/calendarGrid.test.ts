import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
	CALENDAR_CELLS,
	calendarDays,
	clampPagerOffset,
	offsetForDay,
	type OffsetForDayInput,
} from "../src/calendarGrid";

const d = (iso: string) => DateTime.fromISO(iso);

describe("calendarDays", () => {
	it("starts November 2026 on Sunday 1 for a Sunday week, and on Monday 26 Oct for a Monday week", () => {
		const sunday = calendarDays(d("2026-11-17"), 0);
		expect(sunday[0]).toEqual({ iso: "2026-11-01", day: 1, inMonth: true });

		const monday = calendarDays(d("2026-11-17"), 1);
		expect(monday[0]).toEqual({ iso: "2026-10-26", day: 26, inMonth: false });
		expect(monday[6].iso).toBe("2026-11-01");
	});

	it("covers February 2028 (leap year) with 29 in-month days", () => {
		const days = calendarDays(d("2028-02-01"), 0);
		expect(days[0].iso).toBe("2028-01-30");
		const inMonth = days.filter((x) => x.inMonth);
		expect(inMonth).toHaveLength(29);
		expect(inMonth[inMonth.length - 1].iso).toBe("2028-02-29");
	});

	it("gives 42 days starting on the week start for months starting on every weekday", () => {
		const firstWeekdays = new Set<number>();
		for (let m = 0; m < 24; m++) {
			const month = d("2026-01-01").plus({ months: m });
			firstWeekdays.add(month.weekday);
			for (const weekStart of [0, 1] as const) {
				const days = calendarDays(month, weekStart);
				expect(days).toHaveLength(CALENDAR_CELLS);
				expect(d(days[0].iso).weekday).toBe(weekStart === 0 ? 7 : 1);
				expect(days.filter((x) => x.inMonth)).toHaveLength(month.daysInMonth ?? 0);
				const first = days.findIndex((x) => x.inMonth);
				expect(days[first].day).toBe(1);
				// Days are consecutive.
				for (let i = 1; i < days.length; i++) {
					expect(d(days[i].iso).diff(d(days[i - 1].iso), "days").days).toBe(1);
				}
			}
		}
		expect(firstWeekdays.size).toBe(7);
	});
});

describe("clampPagerOffset", () => {
	const today = d("2026-11-05");

	it("is 0 with no activity", () => {
		expect(clampPagerOffset(90, today, null)).toBe(0);
	});

	it("never goes negative or past the earliest active day", () => {
		expect(clampPagerOffset(-5, today, "2026-01-01")).toBe(0);
		expect(clampPagerOffset(500, today, "2026-06-01")).toBe(157);
		expect(clampPagerOffset(90, today, "2026-06-01")).toBe(90);
	});
});

describe("offsetForDay", () => {
	// With today 2026-11-05, 90-day windows and Sunday weeks, the rendered
	// grids are: offset 0 → 2026-08-02..2026-11-05, 90 → 2026-05-10..2026-08-07,
	// 180 → 2026-02-08..2026-05-09.
	const base: OffsetForDayInput = {
		dayIso: "",
		today: d("2026-11-05"),
		windowDays: 90,
		weekStart: 0,
		currentOffset: 0,
		earliestIso: "2025-01-01",
	};

	it("keeps the current offset for a day already in the rendered grid", () => {
		expect(offsetForDay({ ...base, dayIso: "2026-10-01" })).toBe(0);
		// 2026-08-05 is in both the offset-0 and offset-90 grids.
		expect(offsetForDay({ ...base, dayIso: "2026-08-05", currentOffset: 90 })).toBe(90);
		// Offsets clamped by the pager need not be multiples of windowDays.
		expect(
			offsetForDay({
				...base,
				dayIso: "2026-04-01",
				currentOffset: 157,
				earliestIso: "2026-01-01",
			})
		).toBe(157);
	});

	it("pages to the smallest whole number of windows back that shows the day", () => {
		expect(offsetForDay({ ...base, dayIso: "2026-05-09" })).toBe(180);
		expect(offsetForDay({ ...base, dayIso: "2026-05-10" })).toBe(90);
		expect(offsetForDay({ ...base, dayIso: "2026-05-01", currentOffset: 90 })).toBe(180);
	});

	it("clamps a day before the earliest active day", () => {
		expect(
			offsetForDay({ ...base, dayIso: "2026-01-01", earliestIso: "2026-06-01" })
		).toBe(157);
	});

	it("returns 0 for a future day", () => {
		expect(offsetForDay({ ...base, dayIso: "2026-12-01", currentOffset: 90 })).toBe(0);
	});
});
