/**
 * DOM smoke tests for calendar.ts: the grid, dots, and today/selected state.
 */
import { describe, it, expect } from "vitest";
import "../tests/__mocks__/obsidian";
import { TFile } from "obsidian";
import { DateTime } from "luxon";
import {
	MAX_DOTS_PER_KIND,
	renderCalendar,
	updateCalendarCells,
	type CalendarOptions,
} from "../src/calendar";
import type { DayNotes } from "../src/data";

function files(n: number, prefix: string): TFile[] {
	return Array.from({ length: n }, (_, i) => new TFile(`${prefix}${i}.md`));
}

function options(overrides: Partial<CalendarOptions> = {}): CalendarOptions {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const byDay = new Map<string, DayNotes>([
		["2026-11-03", { created: files(5, "c"), modified: files(2, "m") }],
		["2026-11-04", { created: [], modified: files(1, "m") }],
	]);
	return {
		container,
		month: DateTime.fromISO("2026-11-01"),
		weekStart: 0,
		todayIso: "2026-11-05",
		selectedIso: "2026-11-03",
		byDay,
		...overrides,
	};
}

function cell(container: HTMLElement, iso: string): HTMLElement {
	const el = container.querySelector<HTMLElement>(
		`.vault-pulse-calendar-day[data-date="${iso}"]`
	);
	if (!el) throw new Error(`no cell for ${iso}`);
	return el;
}

function dotCount(el: HTMLElement, kind: string): number {
	return el.querySelectorAll(`.vault-pulse-calendar-dot.${kind}`).length;
}

describe("renderCalendar", () => {
	it("renders the title, 7 weekday headers and 42 day cells", () => {
		const opts = options();
		renderCalendar(opts);
		const c = opts.container;
		expect(c.querySelector(".vault-pulse-calendar-month")?.textContent).toBe("November");
		expect(c.querySelector(".vault-pulse-calendar-year")?.textContent).toBe("2026");
		expect(c.querySelectorAll(".vault-pulse-calendar-weekday")).toHaveLength(7);
		expect(c.querySelectorAll(".vault-pulse-calendar-day")).toHaveLength(42);
		expect(c.querySelectorAll("[data-action]")).toHaveLength(2);
	});

	it("orders the weekday header from the week start", () => {
		const weekdays = (weekStart: 0 | 1) => {
			const opts = options({ weekStart });
			renderCalendar(opts);
			return Array.from(
				opts.container.querySelectorAll(".vault-pulse-calendar-weekday"),
				(el) => el.textContent
			);
		};
		expect(weekdays(0)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
		expect(weekdays(1)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
	});

	it("marks adjacent-month days", () => {
		const opts = options({ weekStart: 1 });
		renderCalendar(opts);
		expect(cell(opts.container, "2026-10-26").classList.contains("is-adjacent")).toBe(true);
		expect(cell(opts.container, "2026-11-01").classList.contains("is-adjacent")).toBe(false);
	});

	it("draws one dot per note, capped per kind, created before modified", () => {
		const opts = options();
		renderCalendar(opts);
		const busy = cell(opts.container, "2026-11-03");
		expect(dotCount(busy, "is-created")).toBe(MAX_DOTS_PER_KIND);
		expect(dotCount(busy, "is-modified")).toBe(2);
		const groups = busy.querySelectorAll(".vault-pulse-calendar-dot-group");
		expect(groups[0].querySelector(".is-created")).not.toBeNull();
		expect(groups[1].querySelector(".is-modified")).not.toBeNull();

		const modifiedOnly = cell(opts.container, "2026-11-04");
		expect(dotCount(modifiedOnly, "is-created")).toBe(0);
		expect(dotCount(modifiedOnly, "is-modified")).toBe(1);
		expect(dotCount(cell(opts.container, "2026-11-10"), "is-created")).toBe(0);
	});

	it("marks today and the selected day, with one tab stop on the selected day", () => {
		const opts = options();
		renderCalendar(opts);
		const c = opts.container;
		expect(cell(c, "2026-11-05").classList.contains("is-today")).toBe(true);
		expect(cell(c, "2026-11-03").getAttribute("aria-pressed")).toBe("true");
		expect(c.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
		// Not the generic class, which themes restyle with !important.
		expect(c.querySelectorAll(".is-selected")).toHaveLength(0);
		const tabStops = Array.from(
			c.querySelectorAll<HTMLElement>(".vault-pulse-calendar-day")
		).filter((el) => el.tabIndex === 0);
		expect(tabStops.map((el) => el.dataset.date)).toEqual(["2026-11-03"]);
	});

	it("labels each day with its date and both counts", () => {
		const opts = options();
		renderCalendar(opts);
		const label = cell(opts.container, "2026-11-03").getAttribute("aria-label");
		expect(label).toContain("2026");
		expect(label).toContain("5 created, 2 modified");
	});
});

describe("updateCalendarCells", () => {
	it("moves the selection and redraws dots in place without rebuilding cells", () => {
		const opts = options();
		renderCalendar(opts);
		const before = cell(opts.container, "2026-11-04");

		const byDay = new Map(opts.byDay);
		byDay.set("2026-11-04", { created: files(1, "n"), modified: [] });
		updateCalendarCells({ ...opts, byDay, selectedIso: "2026-11-04" });

		const after = cell(opts.container, "2026-11-04");
		expect(after).toBe(before);
		expect(after.getAttribute("aria-pressed")).toBe("true");
		expect(cell(opts.container, "2026-11-03").getAttribute("aria-pressed")).toBe("false");
		expect(dotCount(after, "is-created")).toBe(1);
		expect(dotCount(after, "is-modified")).toBe(0);
	});

	it("puts the tab stop on the 1st when neither the selection nor today is shown", () => {
		const opts = options({ month: DateTime.fromISO("2026-02-01"), selectedIso: "2026-11-03" });
		renderCalendar(opts);
		const tabStops = Array.from(
			opts.container.querySelectorAll<HTMLElement>(".vault-pulse-calendar-day")
		).filter((el) => el.tabIndex === 0);
		expect(tabStops.map((el) => el.dataset.date)).toEqual(["2026-02-01"]);
	});

	it("moves today when the date rolls over", () => {
		const opts = options();
		renderCalendar(opts);
		updateCalendarCells({ ...opts, todayIso: "2026-11-06" });
		expect(cell(opts.container, "2026-11-05").classList.contains("is-today")).toBe(false);
		expect(cell(opts.container, "2026-11-06").classList.contains("is-today")).toBe(true);
	});

	it("puts the tab stop on today when the selection isn't in the shown month", () => {
		const opts = options({ selectedIso: "2026-01-15" });
		renderCalendar(opts);
		const tabStops = Array.from(
			opts.container.querySelectorAll<HTMLElement>(".vault-pulse-calendar-day")
		).filter((el) => el.tabIndex === 0);
		expect(tabStops.map((el) => el.dataset.date)).toEqual(["2026-11-05"]);
	});
});
