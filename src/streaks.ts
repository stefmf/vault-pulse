import { DateTime } from "luxon";
import { toISODate } from "./dateUtils";

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
 * the moment activity lands today, today's streak becomes `count + 1` and this
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

	const yesterday = DateTime.fromISO(todayIso).minus({ days: 1 });
	const yesterdayIso = toISODate(yesterday);
	if (!allActivity.has(yesterdayIso)) return null;

	let count = 1;
	let startIso = yesterdayIso;
	let cursor = yesterday.minus({ days: 1 });
	for (;;) {
		const key = toISODate(cursor);
		if (!allActivity.has(key)) break;
		count++;
		startIso = key;
		cursor = cursor.minus({ days: 1 });
	}

	// Single-day "yesterday" runs don't merit a UI affordance — there's no
	// streak worth carrying over, just a one-off day.
	if (count < 2) return null;

	return { count, startIso };
}
