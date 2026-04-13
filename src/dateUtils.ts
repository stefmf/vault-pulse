import { DateTime } from "luxon";

export const GRID_COLS = 53;
export const WINDOW_DAYS = 365;

const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

export interface MonthLabelRun {
	name: string;
	startCol: number;
	span: number;
	year: number;
}

export function toISODate(dt: DateTime): string {
	return dt.toFormat("yyyy-MM-dd");
}

/**
 * Start-of-grid date such that today lands in the last column
 * and the first row is the user's week-start day. Always produces
 * a 53-column grid.
 *
 * Luxon weekday: 1 (Mon) ... 7 (Sun). weekStart: 0 = Sunday, 1 = Monday.
 */
export function computeGridStart(today: DateTime, weekStart: 0 | 1): DateTime {
	const windowStart = today.minus({ days: WINDOW_DAYS - 1 }).startOf("day");
	const startLuxon = weekStart === 0 ? 7 : 1;
	const offset = (windowStart.weekday - startLuxon + 7) % 7;
	return windowStart.minus({ days: offset });
}

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
					name: MONTH_NAMES[date.month - 1],
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

