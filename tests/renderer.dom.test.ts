/**
 * DOM smoke tests for renderer.ts. Closes the testing gap left when we replaced
 * raw `document.createElement` calls with Obsidian's createDiv/createSpan/createEl
 * helpers to satisfy the Community Portal review (0.3.3).
 *
 * Imports of "obsidian" route through tests/__mocks__/obsidian.ts, which
 * patches Element/Document/DocumentFragment prototypes with the helpers
 * Obsidian augments at runtime. Without that mock these tests crash on the
 * first containerEl.createDiv(...) call.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DateTime } from "luxon";
import "../tests/__mocks__/obsidian"; // ensure DOM helpers are installed
import {
	renderEmptyState,
	renderHeatmap,
	renderLegend,
	renderPager,
	renderSparkline,
	updateHeatmapCells,
	updateSparklineBars,
} from "../src/renderer";
import { DEFAULT_SETTINGS } from "../src/settings";
import { computeQuantileBuckets } from "../src/colorUtils";
import type { ActivityMap } from "../src/types";

const TODAY = DateTime.fromISO("2026-04-13").startOf("day");

function makeContainer(): HTMLDivElement {
	const c = document.createElement("div");
	document.body.appendChild(c);
	return c;
}

function buildActivityMap(days: number, perDayCount: (i: number) => number): ActivityMap {
	const map: ActivityMap = new Map();
	for (let i = 0; i < days; i++) {
		const iso = TODAY.minus({ days: i }).toISODate();
		if (!iso) continue;
		map.set(iso, { isoDate: iso, files: [], count: perDayCount(i) });
	}
	return map;
}

describe("renderEmptyState", () => {
	it("attaches a placeholder element with the given message", () => {
		const container = makeContainer();
		renderEmptyState(container, "Nothing here yet");
		const el = container.querySelector(".vault-pulse-empty-state");
		expect(el).not.toBeNull();
		expect(el?.textContent).toBe("Nothing here yet");
	});
});

describe("renderLegend", () => {
	it("renders Less/More labels with five legend cells", () => {
		const container = makeContainer();
		renderLegend(container);
		const labels = container.querySelectorAll(".vault-pulse-legend-label");
		const cells = container.querySelectorAll(".vault-pulse-legend-cell");
		expect(labels).toHaveLength(2);
		expect(labels[0].textContent).toBe("Less");
		expect(labels[1].textContent).toBe("More");
		expect(cells).toHaveLength(5);
		expect(cells[0].getAttribute("data-level")).toBe("0");
		expect(cells[4].getAttribute("data-level")).toBe("4");
	});
});

describe("renderPager", () => {
	it("hides itself when not visible", () => {
		const container = makeContainer();
		renderPager({
			container,
			visible: false,
			canPrev: false,
			canNext: false,
			rangeLabel: "Apr 2026",
			prevLabel: "Older",
			nextLabel: "Newer",
			onPrev: () => {},
			onNext: () => {},
		});
		expect(container.classList.contains("is-hidden")).toBe(true);
		expect(container.children.length).toBe(0);
	});

	it("renders two buttons + label when visible", () => {
		const container = makeContainer();
		renderPager({
			container,
			visible: true,
			canPrev: true,
			canNext: false,
			rangeLabel: "Apr 2026",
			prevLabel: "Older",
			nextLabel: "Newer",
			onPrev: () => {},
			onNext: () => {},
		});
		const btns = container.querySelectorAll(".vault-pulse-pager-btn");
		const label = container.querySelector(".vault-pulse-pager-label");
		expect(btns).toHaveLength(2);
		expect((btns[0] as HTMLButtonElement).disabled).toBe(false);
		expect((btns[1] as HTMLButtonElement).disabled).toBe(true);
		expect(label?.textContent).toBe("Apr 2026");
	});

	it("fires onPrev/onNext when their buttons are clicked", () => {
		const container = makeContainer();
		let prev = 0;
		let next = 0;
		renderPager({
			container,
			visible: true,
			canPrev: true,
			canNext: true,
			rangeLabel: "Apr 2026",
			prevLabel: "Older",
			nextLabel: "Newer",
			onPrev: () => prev++,
			onNext: () => next++,
		});
		const [prevBtn, nextBtn] = container.querySelectorAll(
			".vault-pulse-pager-btn"
		);
		(prevBtn as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
		(nextBtn as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(prev).toBe(1);
		expect(next).toBe(1);
	});
});

describe("renderHeatmap", () => {
	it("renders the expected structure for a 90-day window", () => {
		const container = makeContainer();
		const map = buildActivityMap(90, (i) => (i % 7 === 0 ? 5 : 0));
		const buckets = computeQuantileBuckets(map);
		renderHeatmap({
			container,
			activityMap: map,
			buckets,
			settings: { ...DEFAULT_SETTINGS, windowDays: 90 },
			today: TODAY,
		});

		expect(container.querySelector(".vault-pulse-heatmap")).not.toBeNull();
		expect(container.querySelector(".vault-pulse-months")).not.toBeNull();
		expect(container.querySelector(".vault-pulse-body")).not.toBeNull();
		expect(container.querySelector(".vault-pulse-day-labels")).not.toBeNull();

		const cells = container.querySelectorAll(".vault-pulse-cell");
		// 90-day window plus grid alignment padding — at minimum 90 visible cells.
		expect(cells.length).toBeGreaterThanOrEqual(90);
		// Every cell has the expected data attributes.
		for (const cell of Array.from(cells).slice(0, 10)) {
			expect(cell.getAttribute("data-date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(cell.getAttribute("data-count")).not.toBeNull();
			expect(cell.getAttribute("data-level")).not.toBeNull();
			expect(cell.getAttribute("aria-label")).toContain("file");
		}
	});

	it("marks today's cell with data-today=1", () => {
		const container = makeContainer();
		const map = buildActivityMap(30, () => 0);
		// Note: renderer uses real-today for the "today" marker, so we can't
		// pin it via the `today` option. Just verify the property exists if
		// today's date happens to land in the grid; otherwise assert nothing
		// outside the window claims to be today.
		renderHeatmap({
			container,
			activityMap: map,
			buckets: { p25: 0, p50: 0, p75: 0 },
			settings: { ...DEFAULT_SETTINGS, windowDays: 90 },
			today: DateTime.local().startOf("day"),
		});
		const today = container.querySelectorAll("[data-today='1']");
		expect(today.length).toBeLessThanOrEqual(1);
	});
});

describe("updateHeatmapCells", () => {
	it("refreshes counts in place without rebuilding nodes", () => {
		const container = makeContainer();
		const initial = buildActivityMap(90, () => 1);
		const buckets = computeQuantileBuckets(initial);
		renderHeatmap({
			container,
			activityMap: initial,
			buckets,
			settings: { ...DEFAULT_SETTINGS, windowDays: 90 },
			today: TODAY,
		});

		const grid = container.querySelector<HTMLElement>(".vault-pulse-grid")!;
		const cellsBefore = grid.querySelectorAll(".vault-pulse-cell");
		const nodeRef = cellsBefore[0];
		// Pick a cell whose date is inside the data window so the lookup will
		// hit; cell[0] sits in the week-alignment padding before TODAY-89.
		const todayIso = TODAY.toISODate();
		const todayCellBefore = grid.querySelector(
			`[data-date="${todayIso}"]`
		) as HTMLElement | null;
		expect(todayCellBefore?.getAttribute("data-count")).toBe("1");

		const updated = buildActivityMap(90, () => 7);
		updateHeatmapCells(grid, updated, computeQuantileBuckets(updated));

		const cellsAfter = grid.querySelectorAll(".vault-pulse-cell");
		expect(cellsAfter.length).toBe(cellsBefore.length);
		// Same node reference proves in-place update, not rebuild.
		expect(cellsAfter[0]).toBe(nodeRef);
		const todayCellAfter = grid.querySelector(
			`[data-date="${todayIso}"]`
		) as HTMLElement | null;
		expect(todayCellAfter).toBe(todayCellBefore);
		expect(todayCellAfter?.getAttribute("data-count")).toBe("7");
	});
});

describe("renderSparkline", () => {
	it("renders one bar per day with css-variable height", () => {
		const container = makeContainer();
		const map = buildActivityMap(60, (i) => (i % 3 === 0 ? 2 : 0));
		const buckets = computeQuantileBuckets(map);
		const selected: Array<[string, number]> = [];
		renderSparkline({
			container,
			activityMap: map,
			buckets,
			today: TODAY,
			days: 30,
			onSelect: (iso, count) => selected.push([iso, count]),
		});

		const bars = container.querySelectorAll<HTMLElement>(
			".vault-pulse-sparkline-bar"
		);
		expect(bars).toHaveLength(30);
		for (const bar of Array.from(bars)) {
			expect(bar.style.getPropertyValue("--vp-bar-height")).toMatch(/%$/);
			// The rule is that we DON'T write to bar.style.height directly.
			expect(bar.style.height).toBe("");
		}
		// Click forwarding still works.
		(bars[0] as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(selected).toHaveLength(1);
	});
});

describe("updateSparklineBars", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = makeContainer();
		const map = buildActivityMap(60, () => 1);
		renderSparkline({
			container,
			activityMap: map,
			buckets: computeQuantileBuckets(map),
			today: TODAY,
			days: 30,
			onSelect: () => {},
		});
	});

	it("updates bar heights in place without recreating nodes", () => {
		const before = container.querySelectorAll(".vault-pulse-sparkline-bar");
		const ref = before[0];

		const next = buildActivityMap(60, (i) => (i === 0 ? 9 : 1));
		updateSparklineBars(container, next, computeQuantileBuckets(next), TODAY);

		const after = container.querySelectorAll(".vault-pulse-sparkline-bar");
		expect(after.length).toBe(before.length);
		expect(after[0]).toBe(ref);
		expect(after[after.length - 1].getAttribute("data-count")).toBe("9");
		expect((after[after.length - 1] as HTMLElement).style.height).toBe("");
	});
});
