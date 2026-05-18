import { DateTime } from "luxon";
import { Menu, setIcon, TFile } from "obsidian";
import { t } from "./i18n";
import { computeStreakSymbols } from "./streakSymbols";
import type { CarryOverStreak } from "./streaks";
import type { ActivityDay } from "./types";

export interface RecentStats {
	week: number;
	month: number;
	year: number;
}

export interface DetailPanelOptions {
	container: HTMLElement;
	iso: string | null;
	day: ActivityDay | undefined;
	streakCount: number;
	streakStartIso: string | null;
	longestStreak: number;
	recentStats: RecentStats;
	isToday: boolean;
	showStreakCounter: boolean;
	showMiniStats: boolean;
	/**
	 * Yesterday's run, surfaced ONLY when today is selected, today is empty,
	 * and yesterday was a multi-day streak. Renders a desaturated "Yesterday —
	 * N days" chip in place of the active streak chip. `null` means there's
	 * nothing to carry over (either today is active or no prior run exists).
	 */
	carryOver?: CarryOverStreak | null;
	onOpen: (file: TFile) => void;
	onJumpToToday: () => void;
	onHoverPreview: (file: TFile, evt: MouseEvent, targetEl: HTMLElement) => void;
}

/**
 * Render the detail panel below the heatmap. Header shows date, count, streak
 * icons with lifetime-best and "Today →" button; list shows the day's files
 * with stagger fade-in and ⌘-hover previews.
 */
export function renderDetailPanel(options: DetailPanelOptions): void {
	const {
		container,
		iso,
		day,
		streakCount,
		streakStartIso,
		longestStreak,
		recentStats,
		isToday,
		showStreakCounter,
		showMiniStats,
		carryOver = null,
		onOpen,
		onJumpToToday,
		onHoverPreview,
	} = options;

	container.empty();

	if (!iso) {
		container.createDiv({
			cls: "vault-pulse-detail-placeholder",
			text: t("detail.placeholder"),
		});
		return;
	}

	const dt = DateTime.fromISO(iso);
	const count = day?.count ?? 0;

	buildHeader(container, {
		dt,
		count,
		streakCount,
		streakStartIso,
		longestStreak,
		recentStats,
		isToday,
		showStreakCounter,
		showMiniStats,
		carryOver,
		onJumpToToday,
	});

	if (!day || day.count === 0) {
		container.createDiv({
			cls: "vault-pulse-detail-placeholder",
			text: t("detail.noActivity"),
		});
		return;
	}

	const list = container.createDiv({ cls: "vault-pulse-detail-list" });

	day.files.forEach((file, idx) => {
		buildFileRow(list, file, idx, onOpen, onHoverPreview);
	});
}

interface HeaderOptions {
	dt: DateTime;
	count: number;
	streakCount: number;
	streakStartIso: string | null;
	longestStreak: number;
	recentStats: RecentStats;
	isToday: boolean;
	showStreakCounter: boolean;
	showMiniStats: boolean;
	carryOver: CarryOverStreak | null;
	onJumpToToday: () => void;
}

function buildHeader(parent: HTMLElement, opts: HeaderOptions): HTMLElement {
	const {
		dt,
		count,
		streakCount,
		streakStartIso,
		longestStreak,
		recentStats,
		isToday,
		showStreakCounter,
		showMiniStats,
		carryOver,
		onJumpToToday,
	} = opts;

	const header = parent.createDiv({ cls: "vault-pulse-detail-header" });

	const main = header.createDiv({ cls: "vault-pulse-detail-header-main" });

	main.createDiv({
		cls: "vault-pulse-detail-title",
		text: `${dt.toFormat("MMM d, yyyy")} · ${t("detail.files", { count })}`,
	});

	if (streakCount > 1 && showStreakCounter) {
		buildStreakElement(main, streakCount, streakStartIso, longestStreak, false);
	} else if (
		isToday &&
		streakCount === 0 &&
		showStreakCounter &&
		carryOver &&
		carryOver.count >= 2
	) {
		// Today is empty but yesterday's run still deserves visibility — pending
		// state. Same chip layout, desaturated color, "Yesterday — N days"
		// wording so the user reads it as past-tense / pause rather than active.
		buildStreakElement(
			main,
			carryOver.count,
			carryOver.startIso,
			longestStreak,
			true
		);
	}

	if (showMiniStats) {
		buildRecentStatsElement(main, recentStats);
	}

	if (!isToday) {
		const btn = header.createEl("button", {
			cls: "vault-pulse-detail-today-btn",
			text: t("detail.today"),
			attr: { type: "button" },
		});

		const arrow = btn.createSpan({ cls: "vault-pulse-detail-today-arrow" });
		setIcon(arrow, "arrow-right");

		btn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			onJumpToToday();
		});
	}

	return header;
}

function buildStreakElement(
	parent: HTMLElement,
	streakCount: number,
	streakStartIso: string | null,
	longestStreak: number,
	pending: boolean
): HTMLElement {
	const symbols = computeStreakSymbols(streakCount);

	const streakEl = parent.createDiv({ cls: "vault-pulse-detail-streak" });
	if (pending) streakEl.dataset.state = "pending";
	// Chip text is identical to the active state — only the flame color shifts
	// in carry-over. The aria-label adds a "today is empty" hint so screen-reader
	// users learn what the sighted user reads from the yellow flame.
	streakEl.setAttribute(
		"aria-label",
		t(pending ? "detail.streakAriaPending" : "detail.streakAria", {
			days: streakCount,
		})
	);
	streakEl.dataset.flames = String(symbols.flames);
	streakEl.dataset.trophies = String(symbols.trophies);

	buildStreakIcons(streakEl, symbols);

	streakEl.createSpan({
		cls: "vault-pulse-streak-text",
		text: t("detail.streak", { days: streakCount }),
	});

	if (longestStreak > 0) {
		const best = streakEl.createSpan({
			cls: "vault-pulse-streak-best",
			text: t("detail.streakBest", { days: longestStreak }),
		});
		if (streakCount >= longestStreak) best.classList.add("is-record");
	}

	if (symbols.trophies > 0 && streakStartIso) {
		streakEl.classList.add("is-clickable");
		streakEl.setAttribute("role", "button");
		streakEl.tabIndex = 0;
		const open = (evt: MouseEvent) => {
			evt.stopPropagation();
			openAnniversariesMenu(evt, streakStartIso);
		};
		streakEl.addEventListener("click", open);
		streakEl.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				openAnniversariesMenu(
					evt as unknown as MouseEvent,
					streakStartIso
				);
			}
		});
	}

	return streakEl;
}

function buildRecentStatsElement(
	parent: HTMLElement,
	stats: RecentStats
): HTMLElement {
	const row = parent.createDiv({ cls: "vault-pulse-detail-stats" });
	buildStatChip(row, String(stats.week), t("detail.statsWeek"));
	buildStatChip(row, String(stats.month), t("detail.statsMonth"));
	buildStatChip(row, String(stats.year), t("detail.statsYear"));
	return row;
}

function buildStatChip(
	parent: HTMLElement,
	value: string,
	label: string
): HTMLElement {
	const chip = parent.createSpan({ cls: "vault-pulse-detail-stat" });
	chip.createSpan({ cls: "vault-pulse-detail-stat-value", text: value });
	chip.createSpan({ cls: "vault-pulse-detail-stat-label", text: label });
	return chip;
}

function buildStreakIcons(
	parent: HTMLElement,
	symbols: { flames: number; trophies: number }
): HTMLElement {
	const wrap = parent.createSpan({ cls: "vault-pulse-streak-icons" });
	wrap.setAttribute("aria-hidden", "true");

	for (let i = 0; i < symbols.flames; i++) {
		makeIcon(wrap, "flame");
	}

	if (symbols.trophies > 0) {
		makeIcon(wrap, "trophy");
	}

	return wrap;
}

function makeIcon(parent: HTMLElement, kind: "flame" | "trophy"): HTMLElement {
	const icon = parent.createSpan({ cls: "vault-pulse-streak-icon" });
	icon.dataset.kind = kind;
	setIcon(icon, kind);
	return icon;
}

function openAnniversariesMenu(evt: MouseEvent, startIso: string): void {
	const menu = new Menu();
	const anniv = DateTime.fromISO(startIso).plus({ years: 1 });
	menu.addItem((item) =>
		item
			.setTitle(
				t("detail.yearReached", {
					n: 1,
					date: anniv.toFormat("MMM d, yyyy"),
				})
			)
			.setIcon("trophy")
			.setDisabled(true)
	);
	menu.showAtMouseEvent(evt);
}

function buildFileRow(
	parent: HTMLElement,
	file: TFile,
	idx: number,
	onOpen: (file: TFile) => void,
	onHoverPreview: (file: TFile, evt: MouseEvent, targetEl: HTMLElement) => void
): HTMLElement {
	const row = parent.createDiv({ cls: "vault-pulse-detail-row" });
	row.setAttribute("role", "button");
	row.tabIndex = 0;
	row.title = file.path;
	// CSS variable only — drives the stagger animation; not a real style prop.
	row.setCssProps({ "--vp-row-idx": String(idx) });

	const icon = row.createSpan({ cls: "vault-pulse-detail-icon" });
	setIcon(icon, "file-text");

	row.createSpan({
		cls: "vault-pulse-detail-name",
		text: file.basename,
	});

	const open = (evt: Event) => {
		evt.stopPropagation();
		onOpen(file);
	};
	row.addEventListener("click", open);
	row.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter" || evt.key === " ") open(evt);
	});
	row.addEventListener("mouseover", (evt) => {
		onHoverPreview(file, evt, row);
	});

	return row;
}
