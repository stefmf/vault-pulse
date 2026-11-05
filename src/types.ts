export interface ActivityDay {
	isoDate: string;
	count: number;
}

export type ActivityMap = Map<string, ActivityDay>;

export interface QuantileBuckets {
	p25: number;
	p50: number;
	p75: number;
}

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export interface ColorRamp {
	level0: string;
	level1: string;
	level2: string;
	level3: string;
	level4: string;
	/** Text color that reads on `level4`, for the calendar's selected day. */
	onLevel4: string;
	/**
	 * The palette color as text or a thin ring on the pane background (year,
	 * today, selection rings), per theme mode: the strongest stop reads on a
	 * light theme, a lighter stop on a dark one. CSS picks by `.theme-dark`.
	 */
	accentTextLight: string;
	accentTextDark: string;
}
