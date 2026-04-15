import { DateTime } from "luxon";
import { setIcon, setTooltip } from "obsidian";
import {
	computeGridStart,
	computeMonthLabels,
	totalColumns,
	toISODate,
	weekColumn,
	weekRow,
} from "./dateUtils";
import { levelForCount } from "./colorUtils";
import type { ActivityMap, QuantileBuckets } from "./types";
import type { VaultPulseSettings } from "./settings";

export interface RenderContext {
	container: HTMLElement;
	activityMap: ActivityMap;
	buckets: QuantileBuckets;
	settings: VaultPulseSettings;
	today?: DateTime;
}

export function renderHeatmap(ctx: RenderContext): void {
	const {
		container,
		activityMap,
		buckets,
		settings,
		today = DateTime.local().startOf("day"),
	} = ctx;

	const gridStart = computeGridStart(today, settings.weekStart, settings.windowDays);
	const cols = totalColumns(gridStart, today);

	container.style.setProperty("--vp-total-cols", String(cols));

	const heatmap = document.createElement("div");
	heatmap.className = "vault-pulse-heatmap";
	container.appendChild(heatmap);

	heatmap.appendChild(renderMonthLabelRow(gridStart, today, cols));

	const body = document.createElement("div");
	body.className = "vault-pulse-body";
	heatmap.appendChild(body);

	body.appendChild(renderDayLabelColumn(settings.weekStart));
	body.appendChild(renderCellsGrid(activityMap, gridStart, today, buckets, settings));
}

function renderMonthLabelRow(
	gridStart: DateTime,
	today: DateTime,
	cols: number
): HTMLElement {
	const row = document.createElement("div");
	row.className = "vault-pulse-months";
	row.style.setProperty("--vp-total-cols", String(cols));

	const labels = computeMonthLabels(gridStart, today);
	let prevYear = -1;

	for (const label of labels) {
		const span = document.createElement("span");
		span.className = "vault-pulse-month-label";
		if (prevYear !== -1 && label.year !== prevYear) {
			span.textContent = `${label.year} · ${label.name}`;
			span.classList.add("is-year-transition");
		} else {
			span.textContent = label.name;
		}
		span.style.gridColumnStart = String(label.startCol + 1);
		span.style.gridColumnEnd = String(label.startCol + 1 + label.span);
		row.appendChild(span);
		prevYear = label.year;
	}

	return row;
}

function renderDayLabelColumn(weekStart: 0 | 1): HTMLElement {
	const col = document.createElement("div");
	col.className = "vault-pulse-day-labels";

	const labels =
		weekStart === 0
			? ["", "Mon", "", "Wed", "", "Fri", ""]
			: ["", "Tue", "", "Thu", "", "Sat", ""];

	labels.forEach((text, i) => {
		const el = document.createElement("span");
		el.className = "vault-pulse-day-label";
		el.textContent = text;
		el.style.gridRowStart = String(i + 1);
		col.appendChild(el);
	});

	return col;
}

function renderCellsGrid(
	activityMap: ActivityMap,
	gridStart: DateTime,
	today: DateTime,
	buckets: QuantileBuckets,
	settings: VaultPulseSettings
): HTMLElement {
	const grid = document.createElement("div");
	grid.className = "vault-pulse-grid";
	grid.setAttribute("role", "grid");

	const cols = totalColumns(gridStart, today);
	grid.style.setProperty("--vp-total-cols", String(cols));

	const frag = document.createDocumentFragment();
	// `today` here is the grid's right edge (= real today when unpaged, a
	// historic date when paged). The "today" outline must always track the
	// real calendar date so a paged view can still highlight today if it
	// happens to fall inside the visible window.
	const realTodayIso = toISODate(DateTime.local().startOf("day"));

	let cursor = gridStart;
	while (cursor <= today) {
		const iso = toISODate(cursor);
		const day = activityMap.get(iso);
		const count = day?.count ?? 0;
		const level = levelForCount(count, buckets);
		const row = weekRow(cursor, settings.weekStart);
		const col = weekColumn(cursor, gridStart);

		const cell = document.createElement("div");
		cell.className = "vault-pulse-cell";
		cell.dataset.date = iso;
		cell.dataset.count = String(count);
		cell.dataset.level = String(level);
		if (iso === realTodayIso) cell.dataset.today = "1";
		cell.style.gridRow = String(row + 1);
		cell.style.gridColumn = String(col + 1);
		cell.setAttribute("role", "gridcell");
		cell.setAttribute(
			"aria-label",
			`${cursor.toFormat("MMM d")}, ${count} ${count === 1 ? "file" : "files"}`
		);
		cell.tabIndex = -1;

		frag.appendChild(cell);
		cursor = cursor.plus({ days: 1 });
	}

	grid.appendChild(frag);
	return grid;
}

export interface PagerOptions {
	container: HTMLElement;
	visible: boolean;
	canPrev: boolean;
	canNext: boolean;
	rangeLabel: string;
	prevLabel: string;
	nextLabel: string;
	onPrev: () => void;
	onNext: () => void;
}

/**
 * Compact pager row — `◀ [range] ▶` — for stepping the heatmap backward
 * through history one window at a time. Hidden via `.is-hidden` when there's
 * no older activity AND the user hasn't paged away, so it takes no layout
 * space in the common case.
 */
export function renderPager(options: PagerOptions): void {
	const { container, visible, canPrev, canNext, rangeLabel, prevLabel, nextLabel, onPrev, onNext } = options;
	container.empty();
	container.classList.toggle("is-hidden", !visible);
	if (!visible) return;

	container.appendChild(buildPagerButton("chevron-left", prevLabel, canPrev, onPrev));

	const label = document.createElement("span");
	label.className = "vault-pulse-pager-label";
	label.textContent = rangeLabel;
	container.appendChild(label);

	container.appendChild(buildPagerButton("chevron-right", nextLabel, canNext, onNext));
}

function buildPagerButton(
	icon: string,
	ariaLabel: string,
	enabled: boolean,
	onClick: () => void
): HTMLElement {
	const btn = document.createElement("button");
	btn.className = "vault-pulse-pager-btn";
	btn.type = "button";
	btn.setAttribute("aria-label", ariaLabel);
	btn.disabled = !enabled;
	setIcon(btn, icon);
	setTooltip(btn, ariaLabel, { placement: "top" });
	btn.addEventListener("click", (evt) => {
		evt.stopPropagation();
		if (!btn.disabled) onClick();
	});
	return btn;
}

export function renderEmptyState(container: HTMLElement, message: string): void {
	const el = document.createElement("div");
	el.className = "vault-pulse-empty-state";
	el.textContent = message;
	container.appendChild(el);
}

/**
 * Render the "Less ▫▫▫▫▫ More" legend row.
 */
export function renderLegend(container: HTMLElement): void {
	container.empty();
	container.addClass("vault-pulse-legend");

	const less = document.createElement("span");
	less.className = "vault-pulse-legend-label";
	less.textContent = "Less";
	container.appendChild(less);

	const cells = document.createElement("div");
	cells.className = "vault-pulse-legend-cells";
	for (let level = 0; level <= 4; level++) {
		const cell = document.createElement("span");
		cell.className = "vault-pulse-legend-cell";
		cell.dataset.level = String(level);
		cells.appendChild(cell);
	}
	container.appendChild(cells);

	const more = document.createElement("span");
	more.className = "vault-pulse-legend-label";
	more.textContent = "More";
	container.appendChild(more);
}

export interface SparklineOptions {
	container: HTMLElement;
	activityMap: ActivityMap;
	buckets: QuantileBuckets;
	today?: DateTime;
	days?: number;
	onSelect: (iso: string, count: number) => void;
}

/**
 * Render the last-N-days sparkline — a compact bar chart of recent activity
 * that stays visible even when the user has scrolled the main heatmap left.
 *
 * Bars encode activity with BOTH height (proportional to count within the
 * 30-day window) and color (the same 0..4 palette levels as the main grid,
 * via the shared quantile buckets). Clicking a bar selects that day through
 * the same callback the grid uses.
 */
export function renderSparkline(options: SparklineOptions): void {
	const {
		container,
		activityMap,
		buckets,
		today = DateTime.local().startOf("day"),
		days = 30,
		onSelect,
	} = options;

	container.empty();

	interface Bar {
		iso: string;
		count: number;
		date: DateTime;
	}

	const bars: Bar[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const date = today.minus({ days: i });
		const iso = toISODate(date);
		const count = activityMap.get(iso)?.count ?? 0;
		bars.push({ iso, count, date });
	}

	const maxCount = Math.max(1, ...bars.map((b) => b.count));

	bars.forEach((bar, idx) => {
		const el = document.createElement("div");
		el.className = "vault-pulse-sparkline-bar";
		el.dataset.date = bar.iso;
		el.dataset.count = String(bar.count);
		el.dataset.level = String(levelForCount(bar.count, buckets));
		el.setAttribute("role", "button");
		el.tabIndex = -1;

		const pct = bar.count === 0 ? 6 : 15 + (bar.count / maxCount) * 85;
		el.setCssProps({
			"height": `${pct}%`,
			"--vp-bar-idx": String(idx),
		});

		if (bar.count > 0) {
			el.classList.add("is-active");
		}

		el.addEventListener("click", () => onSelect(bar.iso, bar.count));
		el.addEventListener("mouseover", () => {
			const tooltip = `${bar.date.toFormat("MMM d")} · ${bar.count} ${
				bar.count === 1 ? "file" : "files"
			}`;
			setTooltip(el, tooltip, { placement: "top" });
		});

		container.appendChild(el);
	});
}
