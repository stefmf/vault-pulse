import { DateTime, Info } from "luxon";
import { currentLocale, t } from "./i18n";

export const WINDOW_DAYS = 365;

export interface MonthLabelRun {
	name: string;
	startCol: number;
	span: number;
	year: number;
}

export function toISODate(dt: DateTime): string {
	return dt.toFormat("yyyy-MM-dd");
}

/** "Nov 4 · 3 files", localized: the heatmap and sparkline tooltip and label. */
export function dayCountLabel(date: DateTime, count: number): string {
	return t("detail.dayCount", {
		date: date.setLocale(currentLocale()).toFormat("MMM d"),
		count,
	});
}

/**
 * Short weekday names in grid order, starting on the user's week start
 * (0 = Sunday, 1 = Monday). Luxon lists them Monday first.
 */
export function weekdayNames(weekStart: 0 | 1): string[] {
	const mondayFirst = Info.weekdays("short", { locale: currentLocale() });
	if (weekStart === 1) return mondayFirst;
	return [mondayFirst[6], ...mondayFirst.slice(0, 6)];
}

/**
 * Start-of-grid date such that today lands in the last column
 * and the first row is the user's week-start day.
 *
 * Luxon weekday: 1 (Mon) ... 7 (Sun). weekStart: 0 = Sunday, 1 = Monday.
 * The window-length parameter controls how many days the grid covers.
 * Default is WINDOW_DAYS (365) which produces a 53-column grid.
 */
export function computeGridStart(
	today: DateTime,
	weekStart: 0 | 1,
	windowDays: number = WINDOW_DAYS
): DateTime {
	const windowStart = today.minus({ days: windowDays - 1 }).startOf("day");
	return windowStart.minus({ days: weekRow(windowStart, weekStart) });
}

/** Days since the start of the week: 0 on the user's week-start day. */
export function weekRow(date: DateTime, weekStart: 0 | 1): number {
	const startLuxon = weekStart === 0 ? 7 : 1;
	return (date.weekday - startLuxon + 7) % 7;
}

export function weekColumn(date: DateTime, gridStart: DateTime): number {
	const diffDays = Math.floor(date.diff(gridStart, "days").days);
	return Math.floor(diffDays / 7);
}

export function totalColumns(gridStart: DateTime, today: DateTime): number {
	return weekColumn(today, gridStart) + 1;
}

/**
 * Month labels placed at the column where each month first appears in the grid.
 * The first column always gets its own label. Span extends until the next label.
 */
export function computeMonthLabels(
	gridStart: DateTime,
	today: DateTime
): MonthLabelRun[] {
	const labels: MonthLabelRun[] = [];
	const cols = totalColumns(gridStart, today);
	const monthNames = Info.months("short", { locale: currentLocale() });
	let lastLabeledMonth = -1;

	for (let col = 0; col < cols; col++) {
		const colStart = gridStart.plus({ days: col * 7 });
		for (let d = 0; d < 7; d++) {
			const date = colStart.plus({ days: d });
			if (date > today) break;
			const isMonthStart = date.day === 1;
			const isFirstColumn = col === 0 && d === 0;
			if ((isMonthStart || isFirstColumn) && date.month - 1 !== lastLabeledMonth) {
				labels.push({
					name: monthNames[date.month - 1],
					startCol: col,
					span: 1,
					year: date.year,
				});
				lastLabeledMonth = date.month - 1;
				break;
			}
		}
	}

	for (let i = 0; i < labels.length; i++) {
		const nextStart = i < labels.length - 1 ? labels[i + 1].startCol : cols;
		labels[i].span = nextStart - labels[i].startCol;
	}

	return labels;
}

