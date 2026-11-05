import { DateTime } from "luxon";
import { computeGridStart, toISODate } from "./dateUtils";

export const CALENDAR_CELLS = 42;

export interface CalendarDay {
	iso: string;
	/** Day of the month, 1-31. */
	day: number;
	/** False for the greyed days of the months before and after. */
	inMonth: boolean;
}

/**
 * The 42 days (six weeks) a month grid shows, starting on the user's week
 * start. weekStart: 0 = Sunday, 1 = Monday (Luxon weekday 7 and 1).
 */
export function calendarDays(month: DateTime, weekStart: 0 | 1): CalendarDay[] {
	const first = month.startOf("month");
	const startLuxon = weekStart === 0 ? 7 : 1;
	const back = (first.weekday - startLuxon + 7) % 7;
	const start = first.minus({ days: back });

	const days: CalendarDay[] = [];
	for (let i = 0; i < CALENDAR_CELLS; i++) {
		const d = start.plus({ days: i });
		days.push({
			iso: toISODate(d),
			day: d.day,
			inMonth: d.month === first.month && d.year === first.year,
		});
	}
	return days;
}

/**
 * Keep a heatmap pager offset (days back from today) in range: never
 * negative, and never so far back that the window end passes the earliest
 * active day. At the cap, the earliest day sits at the grid's right edge.
 */
export function clampPagerOffset(
	offset: number,
	today: DateTime,
	earliestIso: string | null
): number {
	if (!earliestIso) return 0;
	const earliest = DateTime.fromISO(earliestIso);
	const maxOffset = Math.max(0, Math.floor(today.diff(earliest, "days").days));
	return Math.max(0, Math.min(offset, maxOffset));
}

export interface OffsetForDayInput {
	dayIso: string;
	today: DateTime;
	windowDays: number;
	weekStart: 0 | 1;
	currentOffset: number;
	earliestIso: string | null;
}

/**
 * The heatmap pager offset that shows a selected day.
 * - A day already in the rendered grid (week-aligned grid start through the
 *   window end) keeps the current offset.
 * - Otherwise the smallest whole number of windows back from today whose
 *   rendered grid holds the day, clamped by the pager's limits.
 * - A day after today gives offset 0.
 */
export function offsetForDay(input: OffsetForDayInput): number {
	const { dayIso, today, windowDays, weekStart, currentOffset, earliestIso } = input;
	const todayIso = toISODate(today);
	if (dayIso > todayIso) return 0;

	if (gridHolds(dayIso, today, currentOffset, windowDays, weekStart)) {
		return currentOffset;
	}

	const day = DateTime.fromISO(dayIso);
	const daysBack = Math.max(0, Math.floor(today.diff(day, "days").days));
	const maxSteps = Math.ceil(daysBack / windowDays) + 1;
	for (let k = 0; k <= maxSteps; k++) {
		const offset = k * windowDays;
		if (gridHolds(dayIso, today, offset, windowDays, weekStart)) {
			return clampPagerOffset(offset, today, earliestIso);
		}
	}
	return clampPagerOffset(maxSteps * windowDays, today, earliestIso);
}

function gridHolds(
	dayIso: string,
	today: DateTime,
	offset: number,
	windowDays: number,
	weekStart: 0 | 1
): boolean {
	const windowEnd = today.minus({ days: offset });
	const gridStart = computeGridStart(windowEnd, weekStart, windowDays);
	return dayIso >= toISODate(gridStart) && dayIso <= toISODate(windowEnd);
}
