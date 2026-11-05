export interface StreakSymbols {
	flames: number;
	trophies: number;
}

/**
 * Translate a streak length (in days) into the flame + trophy counts shown in
 * the detail-panel header.
 *
 * The ladder deliberately caps at one trophy: any streak of 365+ days earns
 * it, and longer runs don't add more, so the display stays bounded at
 * `🔥🔥🔥 🏆`. (Streaks are counted over all activity, not just the window.)
 */
export function computeStreakSymbols(days: number): StreakSymbols {
	if (days < 7) return { flames: 0, trophies: 0 };
	if (days < 30) return { flames: 1, trophies: 0 };
	if (days < 100) return { flames: 2, trophies: 0 };
	if (days < 365) return { flames: 3, trophies: 0 };
	return { flames: 3, trophies: 1 };
}
