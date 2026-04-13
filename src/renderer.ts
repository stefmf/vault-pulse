import { DateTime } from "luxon";
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

	const gridStart = computeGridStart(today, settings.weekStart);
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
		// Prefix the year at transitions (e.g. the first January after a
		// December in the window). Skip the very first label so we don't
		// duplicate context the user already has from the current date.
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
	const todayIso = toISODate(today);

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
		if (iso === todayIso) cell.dataset.today = "1";
		cell.style.gridRow = String(row + 1);
		cell.style.gridColumn = String(col + 1);
		cell.setAttribute("role", "gridcell");
		cell.setAttribute(
			"aria-label",
			`${cursor.toFormat("MMM d")}, ${count} ${count === 1 ? "file" : "files"}`
		);
		// Roving tabindex: default -1 here; the view sets tabindex=0 on the
		// currently selected cell so Tab reaches it (and only it).
		cell.tabIndex = -1;

		frag.appendChild(cell);
		cursor = cursor.plus({ days: 1 });
	}

	grid.appendChild(frag);
	return grid;
}

export function renderEmptyState(container: HTMLElement, message: string): void {
	const el = document.createElement("div");
	el.className = "vault-pulse-empty-state";
	el.textContent = message;
	container.appendChild(el);
}

/**
 * Render the "Less ▫▫▫▫▫ More" legend row. Static markup; the cells' colors
 * come from the same --vp-level-{0..4} variables set on the view root,
 * so the legend follows theme/palette changes automatically.
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
