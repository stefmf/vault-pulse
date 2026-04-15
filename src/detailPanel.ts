import { DateTime } from "luxon";
import { Menu, setIcon, TFile } from "obsidian";
import { t } from "./i18n";
import { computeStreakSymbols } from "./streakSymbols";
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
		onOpen,
		onJumpToToday,
		onHoverPreview,
	} = options;

	container.empty();

	if (!iso) {
		const empty = document.createElement("div");
		empty.className = "vault-pulse-detail-placeholder";
		empty.textContent = t("detail.placeholder");
		container.appendChild(empty);
		return;
	}

	const dt = DateTime.fromISO(iso);
	const count = day?.count ?? 0;

	container.appendChild(
		buildHeader({
			dt,
			count,
			streakCount,
			streakStartIso,
			longestStreak,
			recentStats,
			isToday,
			showStreakCounter,
			showMiniStats,
			onJumpToToday,
		})
	);

	if (!day || day.count === 0) {
		const empty = document.createElement("div");
		empty.className = "vault-pulse-detail-placeholder";
		empty.textContent = t("detail.noActivity");
		container.appendChild(empty);
		return;
	}

	const list = document.createElement("div");
	list.className = "vault-pulse-detail-list";
	container.appendChild(list);

	day.files.forEach((file, idx) => {
		list.appendChild(buildFileRow(file, idx, onOpen, onHoverPreview));
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
	onJumpToToday: () => void;
}

function buildHeader(opts: HeaderOptions): HTMLElement {
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
		onJumpToToday,
	} = opts;

	const header = document.createElement("div");
	header.className = "vault-pulse-detail-header";

	const main = document.createElement("div");
	main.className = "vault-pulse-detail-header-main";
	header.appendChild(main);

	const title = document.createElement("div");
	title.className = "vault-pulse-detail-title";
	title.textContent = `${dt.toFormat("MMM d, yyyy")} · ${t("detail.files", {
		count,
	})}`;
	main.appendChild(title);

	if (streakCount > 1 && showStreakCounter) {
		main.appendChild(
			buildStreakElement(streakCount, streakStartIso, longestStreak)
		);
	}

	if (showMiniStats) {
		main.appendChild(buildRecentStatsElement(recentStats));
	}

	if (!isToday) {
		const btn = document.createElement("button");
		btn.className = "vault-pulse-detail-today-btn";
		btn.type = "button";
		btn.textContent = t("detail.today");

		const arrow = document.createElement("span");
		arrow.className = "vault-pulse-detail-today-arrow";
		setIcon(arrow, "arrow-right");
		btn.appendChild(arrow);

		btn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			onJumpToToday();
		});
		header.appendChild(btn);
	}

	return header;
}

function buildStreakElement(
	streakCount: number,
	streakStartIso: string | null,
	longestStreak: number
): HTMLElement {
	const symbols = computeStreakSymbols(streakCount);

	const streakEl = document.createElement("div");
	streakEl.className = "vault-pulse-detail-streak";
	streakEl.setAttribute(
		"aria-label",
		t("detail.streakAria", { days: streakCount })
	);
	streakEl.dataset.flames = String(symbols.flames);
	streakEl.dataset.trophies = String(symbols.trophies);

	streakEl.appendChild(buildStreakIcons(symbols));

	const text = document.createElement("span");
	text.className = "vault-pulse-streak-text";
	text.textContent = t("detail.streak", { days: streakCount });
	streakEl.appendChild(text);

	if (longestStreak > 0) {
		const best = document.createElement("span");
		best.className = "vault-pulse-streak-best";
		if (streakCount >= longestStreak) best.classList.add("is-record");
		best.textContent = t("detail.streakBest", { days: longestStreak });
		streakEl.appendChild(best);
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

function buildRecentStatsElement(stats: RecentStats): HTMLElement {
	const row = document.createElement("div");
	row.className = "vault-pulse-detail-stats";

	row.appendChild(
		buildStatChip(String(stats.week), t("detail.statsWeek"))
	);
	row.appendChild(
		buildStatChip(String(stats.month), t("detail.statsMonth"))
	);
	row.appendChild(
		buildStatChip(String(stats.year), t("detail.statsYear"))
	);

	return row;
}

function buildStatChip(value: string, label: string): HTMLElement {
	const chip = document.createElement("span");
	chip.className = "vault-pulse-detail-stat";

	const v = chip.createSpan({ cls: "vault-pulse-detail-stat-value" });
	v.textContent = value;

	const l = chip.createSpan({ cls: "vault-pulse-detail-stat-label" });
	l.textContent = label;

	return chip;
}

function buildStreakIcons(symbols: {
	flames: number;
	trophies: number;
}): HTMLElement {
	const wrap = document.createElement("span");
	wrap.className = "vault-pulse-streak-icons";
	wrap.setAttribute("aria-hidden", "true");

	for (let i = 0; i < symbols.flames; i++) {
		wrap.appendChild(makeIcon("flame"));
	}

	if (symbols.trophies > 0) {
		wrap.appendChild(makeIcon("trophy"));
	}

	return wrap;
}

function makeIcon(kind: "flame" | "trophy"): HTMLElement {
	const icon = document.createElement("span");
	icon.className = "vault-pulse-streak-icon";
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
	file: TFile,
	idx: number,
	onOpen: (file: TFile) => void,
	onHoverPreview: (file: TFile, evt: MouseEvent, targetEl: HTMLElement) => void
): HTMLElement {
	const row = document.createElement("div");
	row.className = "vault-pulse-detail-row";
	row.setAttribute("role", "button");
	row.tabIndex = 0;
	row.title = file.path;
	row.setCssProps({ "--vp-row-idx": String(idx) });

	const icon = document.createElement("span");
	icon.className = "vault-pulse-detail-icon";
	setIcon(icon, "file-text");
	row.appendChild(icon);

	const label = document.createElement("span");
	label.className = "vault-pulse-detail-name";
	label.textContent = file.basename;
	row.appendChild(label);

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
