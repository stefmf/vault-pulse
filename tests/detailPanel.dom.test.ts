/**
 * DOM smoke tests for detailPanel.ts — guards the createDiv / createSpan /
 * createEl refactor from 0.3.3, and the Created / Modified groups from 0.4.0.
 */
import { describe, it, expect } from "vitest";
import "../tests/__mocks__/obsidian";
import { TFile } from "obsidian";
import { renderDetailPanel, type DetailPanelOptions, type OpenTarget } from "../src/detailPanel";

function makeContainer(): HTMLDivElement {
	const c = document.createElement("div");
	document.body.appendChild(c);
	return c;
}

const noopOpen = (_f: TFile, _t: OpenTarget) => {};
const noopHover = (_f: TFile, _e: MouseEvent, _t: HTMLElement) => {};
const noopJump = () => {};

function render(overrides: Partial<DetailPanelOptions>): HTMLDivElement {
	const container = makeContainer();
	renderDetailPanel({
		container,
		iso: "2026-04-13",
		created: [],
		modified: [],
		streakCount: 0,
		streakStartIso: null,
		longestStreak: 0,
		recentStats: { week: 0, month: 0, year: 0 },
		isToday: false,
		showStreakCounter: false,
		showMiniStats: false,
		onOpen: noopOpen,
		onJumpToToday: noopJump,
		onHoverPreview: noopHover,
		...overrides,
	});
	return container;
}

function groupTitles(container: HTMLElement): string[] {
	return Array.from(
		container.querySelectorAll(".vault-pulse-detail-group-title"),
		(el) => el.textContent ?? ""
	);
}

describe("renderDetailPanel", () => {
	it("renders a placeholder when no date is selected", () => {
		const container = render({ iso: null });
		const placeholder = container.querySelector(
			".vault-pulse-detail-placeholder"
		);
		expect(placeholder).not.toBeNull();
		expect(container.querySelector(".vault-pulse-detail-header")).toBeNull();
	});

	it("renders header + no-activity placeholder when both groups are empty", () => {
		const container = render({});
		expect(container.querySelector(".vault-pulse-detail-header")).not.toBeNull();
		expect(container.querySelector(".vault-pulse-detail-list")).toBeNull();
		expect(
			container.querySelectorAll(".vault-pulse-detail-placeholder")
		).toHaveLength(1);
	});

	it("renders one row per file with the file's basename and a Today button on non-today days", () => {
		const files = [new TFile("notes/a.md"), new TFile("notes/b.md")];
		let opened: TFile | null = null;
		const container = render({
			created: files,
			streakCount: 3,
			streakStartIso: "2026-04-11",
			longestStreak: 10,
			recentStats: { week: 5, month: 30, year: 200 },
			showStreakCounter: true,
			showMiniStats: true,
			onOpen: (f) => {
				opened = f;
			},
		});

		const rows = container.querySelectorAll(".vault-pulse-detail-row");
		expect(rows).toHaveLength(2);
		expect(rows[0].querySelector(".vault-pulse-detail-name")?.textContent).toBe(
			"a"
		);
		expect(rows[1].querySelector(".vault-pulse-detail-name")?.textContent).toBe(
			"b"
		);

		const todayBtn = container.querySelector(".vault-pulse-detail-today-btn");
		expect(todayBtn).not.toBeNull();
		expect((todayBtn as HTMLButtonElement).type).toBe("button");

		// Stat chips
		const chips = container.querySelectorAll(".vault-pulse-detail-stat");
		expect(chips).toHaveLength(3);
		expect(
			chips[0].querySelector(".vault-pulse-detail-stat-value")?.textContent
		).toBe("5");

		// Streak element exists
		expect(container.querySelector(".vault-pulse-detail-streak")).not.toBeNull();

		// Row click forwards to onOpen
		(rows[0] as HTMLElement).dispatchEvent(
			new MouseEvent("click", { bubbles: true })
		);
		expect((opened as TFile | null)?.path).toBe("notes/a.md");
	});

	it("renders Created then Modified groups in one list, with a row count in the header", () => {
		const container = render({
			created: [new TFile("c1.md"), new TFile("c2.md")],
			modified: [new TFile("m1.md")],
		});
		expect(container.querySelectorAll(".vault-pulse-detail-list")).toHaveLength(1);
		expect(groupTitles(container)).toEqual(["Created", "Modified"]);
		const names = Array.from(
			container.querySelectorAll(".vault-pulse-detail-name"),
			(el) => el.textContent
		);
		expect(names).toEqual(["c1", "c2", "m1"]);
		expect(
			container.querySelector(".vault-pulse-detail-title")?.textContent
		).toContain("3 files");
	});

	it("hides an empty group", () => {
		expect(groupTitles(render({ modified: [new TFile("m.md")] }))).toEqual([
			"Modified",
		]);
		expect(groupTitles(render({ created: [new TFile("c.md")] }))).toEqual([
			"Created",
		]);
	});

	it("opens in the current tab on a plain click and a new tab on a modifier click", () => {
		const targets: OpenTarget[] = [];
		const container = render({
			created: [new TFile("a.md")],
			onOpen: (_f, target) => {
				targets.push(target);
			},
		});
		const row = container.querySelector<HTMLElement>(".vault-pulse-detail-row");
		row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		row?.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
		row?.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
		expect(targets).toEqual([false, "tab", "tab"]);
	});

	it("renders a pending streak chip when today is empty AND carryOver is present", () => {
		const container = render({
			longestStreak: 10,
			isToday: true,
			showStreakCounter: true,
			carryOver: { count: 10, startIso: "2026-04-03" },
		});
		const chip = container.querySelector(".vault-pulse-detail-streak");
		expect(chip).not.toBeNull();
		expect(chip?.getAttribute("data-state")).toBe("pending");
		// Text is identical to the active state; only the data-state attr (and
		// the resulting CSS yellow flame) signals carry-over. aria-label still
		// adds context for screen-reader users.
		const text = chip?.querySelector(".vault-pulse-streak-text")?.textContent;
		expect(text).toBe("10-day streak");
		expect(chip?.getAttribute("aria-label")).toContain("today is empty");
	});

	it("does NOT render a pending chip when carryOver is below the 2-day threshold", () => {
		const container = render({
			longestStreak: 1,
			isToday: true,
			showStreakCounter: true,
			carryOver: null,
		});
		expect(container.querySelector(".vault-pulse-detail-streak")).toBeNull();
	});

	it("prefers active streak over carry-over when today has activity", () => {
		const container = render({
			created: [new TFile("notes/today.md")],
			streakCount: 11,
			streakStartIso: "2026-04-03",
			longestStreak: 11,
			recentStats: { week: 7, month: 30, year: 200 },
			isToday: true,
			showStreakCounter: true,
			// carryOver would normally be null in this case, but we pass one
			// anyway to verify the active-streak path wins.
			carryOver: { count: 10, startIso: "2026-04-03" },
		});
		const chip = container.querySelector(".vault-pulse-detail-streak");
		expect(chip?.getAttribute("data-state")).toBeNull();
	});

	it("omits the Today button when isToday is true", () => {
		const container = render({
			created: [new TFile("notes/x.md")],
			streakCount: 1,
			streakStartIso: "2026-04-13",
			longestStreak: 1,
			recentStats: { week: 1, month: 1, year: 1 },
			isToday: true,
		});
		expect(container.querySelector(".vault-pulse-detail-today-btn")).toBeNull();
	});
});
