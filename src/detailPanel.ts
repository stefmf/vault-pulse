import { DateTime } from "luxon";
import { setIcon, TFile } from "obsidian";
import type { ActivityDay } from "./types";

export interface DetailPanelOptions {
	container: HTMLElement;
	iso: string | null;
	day: ActivityDay | undefined;
	streak: number;
	isToday: boolean;
	onOpen: (file: TFile) => void;
	onJumpToToday: () => void;
	onHoverPreview: (file: TFile, evt: MouseEvent, targetEl: HTMLElement) => void;
}

/**
 * Render the static detail panel below the heatmap.
 * Header shows date, count, streak (if any), and a "Today →" button
 * when the selected day isn't today. List shows files, with stagger
 * fade-in and ⌘-hover previews.
 */
export function renderDetailPanel(options: DetailPanelOptions): void {
	const { container, iso, day, streak, isToday, onOpen, onJumpToToday, onHoverPreview } = options;
	container.empty();

	if (!iso) {
		const empty = document.createElement("div");
		empty.className = "vault-pulse-detail-placeholder";
		empty.textContent = "Click a day to see its files.";
		container.appendChild(empty);
		return;
	}

	const dt = DateTime.fromISO(iso);
	const count = day?.count ?? 0;

	container.appendChild(buildHeader(dt, count, streak, isToday, onJumpToToday));

	if (!day || day.count === 0) {
		const empty = document.createElement("div");
		empty.className = "vault-pulse-detail-placeholder";
		empty.textContent = "No activity this day.";
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

function buildHeader(
	dt: DateTime,
	count: number,
	streak: number,
	isToday: boolean,
	onJumpToToday: () => void
): HTMLElement {
	const header = document.createElement("div");
	header.className = "vault-pulse-detail-header";

	const main = document.createElement("div");
	main.className = "vault-pulse-detail-header-main";
	header.appendChild(main);

	const title = document.createElement("div");
	title.className = "vault-pulse-detail-title";
	title.textContent = `${dt.toFormat("MMM d, yyyy")} · ${count} ${
		count === 1 ? "file" : "files"
	}`;
	main.appendChild(title);

	if (streak > 1) {
		const streakEl = document.createElement("div");
		streakEl.className = "vault-pulse-detail-streak";

		const iconWrap = document.createElement("span");
		iconWrap.className = "vault-pulse-detail-streak-icon";
		setIcon(iconWrap, "flame");
		streakEl.appendChild(iconWrap);

		const text = document.createElement("span");
		text.textContent = `${streak}-day streak`;
		streakEl.appendChild(text);

		main.appendChild(streakEl);
	}

	if (!isToday) {
		const btn = document.createElement("button");
		btn.className = "vault-pulse-detail-today-btn";
		btn.type = "button";
		btn.textContent = "Today";

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
	row.style.setProperty("--vp-row-idx", String(idx));

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
