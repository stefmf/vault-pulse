/**
 * DOM smoke tests for detailPanel.ts — guards the createDiv / createSpan /
 * createEl refactor from 0.3.3.
 */
import { describe, it, expect } from "vitest";
import "../tests/__mocks__/obsidian";
import { TFile } from "obsidian";
import { renderDetailPanel } from "../src/detailPanel";
import type { ActivityDay } from "../src/types";

function makeContainer(): HTMLDivElement {
	const c = document.createElement("div");
	document.body.appendChild(c);
	return c;
}

const noopOpen = (_f: TFile) => {};
const noopHover = (_f: TFile, _e: MouseEvent, _t: HTMLElement) => {};
const noopJump = () => {};

describe("renderDetailPanel", () => {
	it("renders a placeholder when no date is selected", () => {
		const container = makeContainer();
		renderDetailPanel({
			container,
			iso: null,
			day: undefined,
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
		});
		const placeholder = container.querySelector(
			".vault-pulse-detail-placeholder"
		);
		expect(placeholder).not.toBeNull();
		expect(container.querySelector(".vault-pulse-detail-header")).toBeNull();
	});

	it("renders header + no-activity placeholder for a zero-count day", () => {
		const container = makeContainer();
		renderDetailPanel({
			container,
			iso: "2026-04-13",
			day: { isoDate: "2026-04-13", files: [], count: 0 },
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
		});
		expect(container.querySelector(".vault-pulse-detail-header")).not.toBeNull();
		expect(container.querySelector(".vault-pulse-detail-list")).toBeNull();
		expect(
			container.querySelectorAll(".vault-pulse-detail-placeholder")
		).toHaveLength(1);
	});

	it("renders one row per file with the file's basename and a Today button on non-today days", () => {
		const container = makeContainer();
		const files = [new TFile("notes/a.md"), new TFile("notes/b.md")];
		const day: ActivityDay = {
			isoDate: "2026-04-13",
			files,
			count: files.length,
		};
		let opened: TFile | null = null;
		renderDetailPanel({
			container,
			iso: "2026-04-13",
			day,
			streakCount: 3,
			streakStartIso: "2026-04-11",
			longestStreak: 10,
			recentStats: { week: 5, month: 30, year: 200 },
			isToday: false,
			showStreakCounter: true,
			showMiniStats: true,
			onOpen: (f) => {
				opened = f;
			},
			onJumpToToday: noopJump,
			onHoverPreview: noopHover,
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

	it("renders a pending streak chip when today is empty AND carryOver is present", () => {
		const container = makeContainer();
		renderDetailPanel({
			container,
			iso: "2026-04-13",
			day: { isoDate: "2026-04-13", files: [], count: 0 },
			streakCount: 0,
			streakStartIso: null,
			longestStreak: 10,
			recentStats: { week: 0, month: 0, year: 0 },
			isToday: true,
			showStreakCounter: true,
			showMiniStats: false,
			carryOver: { count: 10, startIso: "2026-04-03" },
			onOpen: noopOpen,
			onJumpToToday: noopJump,
			onHoverPreview: noopHover,
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
		const container = makeContainer();
		renderDetailPanel({
			container,
			iso: "2026-04-13",
			day: { isoDate: "2026-04-13", files: [], count: 0 },
			streakCount: 0,
			streakStartIso: null,
			longestStreak: 1,
			recentStats: { week: 0, month: 0, year: 0 },
			isToday: true,
			showStreakCounter: true,
			showMiniStats: false,
			carryOver: null,
			onOpen: noopOpen,
			onJumpToToday: noopJump,
			onHoverPreview: noopHover,
		});
		expect(container.querySelector(".vault-pulse-detail-streak")).toBeNull();
	});

	it("prefers active streak over carry-over when today has activity", () => {
		const container = makeContainer();
		const file = new TFile("notes/today.md");
		renderDetailPanel({
			container,
			iso: "2026-04-13",
			day: { isoDate: "2026-04-13", files: [file], count: 1 },
			streakCount: 11,
			streakStartIso: "2026-04-03",
			longestStreak: 11,
			recentStats: { week: 7, month: 30, year: 200 },
			isToday: true,
			showStreakCounter: true,
			showMiniStats: false,
			// carryOver would normally be null in this case, but we pass one
			// anyway to verify the active-streak path wins.
			carryOver: { count: 10, startIso: "2026-04-03" },
			onOpen: noopOpen,
			onJumpToToday: noopJump,
			onHoverPreview: noopHover,
		});
		const chip = container.querySelector(".vault-pulse-detail-streak");
		expect(chip?.getAttribute("data-state")).toBeNull();
	});

	it("omits the Today button when isToday is true", () => {
		const container = makeContainer();
		const file = new TFile("notes/x.md");
		renderDetailPanel({
			container,
			iso: "2026-04-13",
			day: { isoDate: "2026-04-13", files: [file], count: 1 },
			streakCount: 1,
			streakStartIso: "2026-04-13",
			longestStreak: 1,
			recentStats: { week: 1, month: 1, year: 1 },
			isToday: true,
			showStreakCounter: false,
			showMiniStats: false,
			onOpen: noopOpen,
			onJumpToToday: noopJump,
			onHoverPreview: noopHover,
		});
		expect(container.querySelector(".vault-pulse-detail-today-btn")).toBeNull();
	});
});
