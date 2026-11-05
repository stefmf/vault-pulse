import { DateTime } from "luxon";
import { toISODate } from "./dateUtils";

/**
 * The run of consecutive active days ending at `endIso`, oldest first. Empty
 * when `endIso` itself has no activity. The one streak walk the status bar,
 * the detail panel and the carry-over chip all share.
 */
export function streakEndingAt(
	activity: Map<string, number>,
	endIso: string
): string[] {
	if (!activity.has(endIso)) return [];
	const isos = [endIso];
	let cursor = DateTime.fromISO(endIso).minus({ days: 1 });
	for (;;) {
		const key = toISODate(cursor);
		if (!activity.has(key)) break;
		isos.push(key);
		cursor = cursor.minus({ days: 1 });
	}
	return isos.reverse();
}

/**
 * Streak that ENDED YESTERDAY rather than today. Distinct from the live streak
 * we surface in the normal flame chip — this one fires only when:
 *
 *   - today has zero activity (so the live streak count is 0)
 *   - yesterday is in `allActivity`
 *   - the run ending at yesterday is at least 2 days long
 *
 * UI uses it to show a yellow / desaturated "Yesterday — N days" chip so the
 * user sees their previous run before it falls out of the live counter. The
 * moment activity lands today, today's streak becomes `count + 1` and this
 * function returns null (active streak supersedes carry-over).
 *
 * Returning `null` is the "no carry-over to show" signal — callers pass it
 * around without separately tracking active vs pending state.
 */
export interface CarryOverStreak {
	count: number;
	startIso: string;
}

export function computeCarryOverStreak(
	allActivity: Map<string, number>,
	todayIso: string
): CarryOverStreak | null {
	// Active streak takes precedence — no carry-over while today is alive.
	if (allActivity.has(todayIso)) return null;

	const yesterdayIso = toISODate(DateTime.fromISO(todayIso).minus({ days: 1 }));
	const run = streakEndingAt(allActivity, yesterdayIso);

	// Single-day "yesterday" runs don't merit a UI affordance — there's no
	// streak worth carrying over, just a one-off day.
	if (run.length < 2) return null;

	return { count: run.length, startIso: run[0] };
}
